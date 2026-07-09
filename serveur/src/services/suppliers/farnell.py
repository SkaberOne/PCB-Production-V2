"""Farnell / element14 Product Search API (REST) connector.

Auth: API key in the query string (``callInfo.apiKey``). Search is a GET on a
single endpoint; the search term selects the response shape:

  term=manuPartNum:<MPN>  -> root key "manufacturerPartNumberSearchReturn"
  term=any:<keyword>      -> root key "keywordSearchReturn"
  term=id:<sku>           -> root key "premierFarnellPartNumberReturn"

The ``storeInfo.id`` parameter picks the regional store (and thus the currency):
``fr.farnell.com`` => EUR. Docs:
https://partner.element14.com/docs/read/Product_Search_API_REST__Description
"""

from __future__ import annotations

import logging
from typing import Callable, List, Optional

from ...config import settings
from .base import OfferDTO, SupplierConnector

logger = logging.getLogger(__name__)

DEFAULT_BASE_URL = "https://api.element14.com/catalog/products"
DEFAULT_STORE_ID = "fr.farnell.com"
DEFAULT_CURRENCY = "EUR"
_MAX_RESULTS = 10


def _to_int(raw) -> Optional[int]:
    try:
        return int(float(raw))
    except (TypeError, ValueError):
        return None


def _to_float(raw) -> Optional[float]:
    try:
        return float(raw)
    except (TypeError, ValueError):
        return None


class FarnellConnector(SupplierConnector):
    name = "FARNELL"

    def __init__(
        self,
        api_key: Optional[str] = None,
        store_id: Optional[str] = None,
        currency: Optional[str] = None,
        base_url: Optional[str] = None,
        http_get: Optional[Callable[[str, dict], dict]] = None,
    ):
        # None => fall back to settings; an explicit "" forces "unconfigured" (tests).
        self.api_key = api_key if api_key is not None else settings.farnell_api_key
        self.store_id = store_id or settings.farnell_store_id or DEFAULT_STORE_ID
        self.currency = currency or settings.farnell_currency or DEFAULT_CURRENCY
        self.base_url = (base_url or settings.farnell_api_url or DEFAULT_BASE_URL).rstrip("/")
        self._http_get = http_get  # injectable for tests

    @property
    def is_configured(self) -> bool:
        return bool(self.api_key)

    # --- public API -------------------------------------------------------
    def search_by_mpn(self, mpn: str) -> List[OfferDTO]:
        if not mpn or not self.is_configured:
            return []
        data = self._get(f"manuPartNum:{mpn}")
        offers = self._parse_products(data)
        exact = [o for o in offers if (o.mpn or "").upper() == mpn.upper()]
        return exact or offers

    def search_by_keyword(self, keyword: str) -> List[OfferDTO]:
        if not keyword or not self.is_configured:
            return []
        return self._parse_products(self._get(f"any:{keyword}"))

    # --- internals --------------------------------------------------------
    def _get(self, term: str) -> dict:
        params = {
            "term": term,
            "storeInfo.id": self.store_id,
            "resultsSettings.offset": 0,
            "resultsSettings.numberOfResults": _MAX_RESULTS,
            "resultsSettings.responseGroup": "large",
            "callInfo.responseDataFormat": "JSON",
            "callInfo.apiKey": self.api_key,
        }
        if self._http_get is not None:
            return self._http_get(self.base_url, params)
        import httpx  # imported lazily so the module loads without the dep at rest

        try:
            response = httpx.get(self.base_url, params=params, timeout=15.0)
            response.raise_for_status()
            return response.json()
        except Exception as exc:  # network/parse errors degrade to "no offers"
            logger.warning("Farnell request failed (%s): %s", term, exc)
            return {}

    @staticmethod
    def _extract_products(data: dict) -> List[dict]:
        """Pick the ``products`` list from whichever *SearchReturn root key is present."""
        if not data:
            return []
        for key, value in data.items():
            if key.endswith("Return") and isinstance(value, dict):
                return value.get("products") or []
        # Some payloads nest the products directly.
        return data.get("products") or []

    def _parse_products(self, data: dict) -> List[OfferDTO]:
        products = self._extract_products(data)
        offers: List[OfferDTO] = []
        for product in products:
            breaks = []
            for brk in product.get("prices") or []:
                qty = _to_int(brk.get("from"))
                price = _to_float(brk.get("cost"))
                if qty is not None and price is not None:
                    breaks.append({"qty": qty, "price": price})
            breaks.sort(key=lambda b: b["qty"])

            stock = product.get("stock") or {}
            sku = product.get("sku")
            datasheets = product.get("datasheets") or []
            datasheet_url = datasheets[0].get("url") if datasheets else None

            offers.append(
                OfferDTO(
                    supplier=self.name,
                    supplier_part=sku,
                    mpn=product.get("translatedManufacturerPartNumber"),
                    manufacturer=product.get("brandName") or product.get("vendorName"),
                    product_url=self._product_url(sku),
                    datasheet_url=datasheet_url,
                    currency=self.currency,
                    unit_price=breaks[0]["price"] if breaks else None,
                    stock_qty=_to_int(stock.get("level")),
                    lead_time_days=_to_int(stock.get("leastLeadTime")),
                    lifecycle_status=product.get("productStatus"),  # ADR 0014
                    price_breaks=breaks,
                )
            )
        return offers

    def _product_url(self, sku: Optional[str]) -> Optional[str]:
        if not sku:
            return None
        return f"https://{self.store_id}/search?st={sku}"
