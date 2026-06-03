"""DigiKey Product Information v4 connector (OAuth2 2-legged).

Inactive until DIGIKEY_CLIENT_ID and DIGIKEY_CLIENT_SECRET are set in .env, so the
rest of the system degrades gracefully when DigiKey is not provisioned yet.

Docs: https://developer.digikey.com/products/product-information-v4
"""

from __future__ import annotations

import logging
from typing import Callable, List, Optional

from ...config import settings
from .base import OfferDTO, SupplierConnector
from .oauth import OAuth2ClientCredentials

logger = logging.getLogger(__name__)

DEFAULT_BASE_URL = "https://api.digikey.com"
DEFAULT_OAUTH_URL = "https://api.digikey.com/v1/oauth2/token"


def _to_int(raw) -> Optional[int]:
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


def _to_float(raw) -> Optional[float]:
    try:
        return float(raw)
    except (TypeError, ValueError):
        return None


class DigiKeyConnector(SupplierConnector):
    name = "DIGIKEY"

    def __init__(
        self,
        client_id: Optional[str] = None,
        client_secret: Optional[str] = None,
        base_url: Optional[str] = None,
        oauth: Optional[OAuth2ClientCredentials] = None,
        http_post: Optional[Callable[[str, dict, dict], dict]] = None,
    ):
        self.client_id = client_id if client_id is not None else settings.digikey_client_id
        self.client_secret = (
            client_secret if client_secret is not None else settings.digikey_client_secret
        )
        self.base_url = (base_url or settings.digikey_api_url or DEFAULT_BASE_URL).rstrip("/")
        self.locale_site = settings.digikey_locale_site or "FR"
        self.locale_currency = settings.digikey_locale_currency or "EUR"
        self.locale_language = settings.digikey_locale_language or "fr"
        self._http_post = http_post  # callable(url, json_body, headers) -> dict, for tests
        self._oauth = oauth or (
            OAuth2ClientCredentials(
                token_url=settings.digikey_oauth_url or DEFAULT_OAUTH_URL,
                client_id=self.client_id or "",
                client_secret=self.client_secret or "",
            )
            if self.client_id and self.client_secret
            else None
        )

    @property
    def is_configured(self) -> bool:
        return bool(self.client_id and self.client_secret and self._oauth)

    # --- public API -------------------------------------------------------
    def search_by_mpn(self, mpn: str) -> List[OfferDTO]:
        if not mpn or not self.is_configured:
            return []
        body = {"Keywords": mpn, "Limit": 10, "Offset": 0}
        data = self._post("/products/v4/search/keyword", body)
        offers = self._parse_products(data)
        exact = [o for o in offers if (o.mpn or "").upper() == mpn.upper()]
        return exact or offers

    def search_by_keyword(self, keyword: str) -> List[OfferDTO]:
        if not keyword or not self.is_configured:
            return []
        body = {"Keywords": keyword, "Limit": 10, "Offset": 0}
        return self._parse_products(self._post("/products/v4/search/keyword", body))

    # --- internals --------------------------------------------------------
    def _headers(self) -> dict:
        token = self._oauth.get_token() if self._oauth else None
        return {
            "Authorization": f"Bearer {token}",
            "X-DIGIKEY-Client-Id": self.client_id or "",
            "X-DIGIKEY-Locale-Site": self.locale_site,
            "X-DIGIKEY-Locale-Currency": self.locale_currency,
            "X-DIGIKEY-Locale-Language": self.locale_language,
            "Content-Type": "application/json",
        }

    def _post(self, path: str, body: dict) -> dict:
        url = f"{self.base_url}{path}"
        headers = self._headers()
        if not headers.get("Authorization", "").replace("Bearer ", "").strip():
            logger.warning("DigiKey: no valid token, skipping request")
            return {}
        if self._http_post is not None:
            return self._http_post(url, body, headers)
        import httpx

        try:
            response = httpx.post(url, json=body, headers=headers, timeout=15.0)
            response.raise_for_status()
            return response.json()
        except Exception as exc:
            logger.warning("DigiKey request failed (%s): %s", path, exc)
            return {}

    def _parse_products(self, data: dict) -> List[OfferDTO]:
        if not data:
            return []
        products = data.get("Products") or []
        offers: List[OfferDTO] = []
        for product in products:
            manufacturer = product.get("Manufacturer") or {}
            if isinstance(manufacturer, dict):
                manufacturer = manufacturer.get("Name")
            variation = self._select_variation(product)
            breaks = self._variation_breaks(variation)
            offers.append(
                OfferDTO(
                    supplier=self.name,
                    supplier_part=(variation or {}).get("DigiKeyProductNumber")
                    or product.get("DigiKeyProductNumber"),
                    mpn=product.get("ManufacturerProductNumber"),
                    manufacturer=manufacturer,
                    product_url=product.get("ProductUrl"),
                    datasheet_url=product.get("DatasheetUrl"),
                    currency=self.locale_currency,
                    unit_price=breaks[0]["price"] if breaks else None,
                    stock_qty=_to_int(product.get("QuantityAvailable")),
                    lead_time_days=_to_int(product.get("ManufacturerLeadWeeks")),
                    price_breaks=breaks,
                )
            )
        return offers

    @staticmethod
    def _variation_breaks(variation: Optional[dict]) -> List[dict]:
        if not variation:
            return []
        breaks: List[dict] = []
        for pricing in variation.get("StandardPricing") or []:
            qty = _to_int(pricing.get("BreakQuantity"))
            price = _to_float(pricing.get("UnitPrice"))
            if qty is not None and price is not None:
                breaks.append({"qty": qty, "price": price})
        breaks.sort(key=lambda b: b["qty"])
        return breaks

    @classmethod
    def _select_variation(cls, product: dict) -> Optional[dict]:
        """Pick the most relevant priced variation.

        Prefers the variation whose price breaks start at the smallest quantity
        (cut tape / qty 1) so the indicative unit price is comparable to other
        suppliers instead of bulk/reel pricing.
        """
        variations = product.get("ProductVariations") or []
        priced = [v for v in variations if cls._variation_breaks(v)]
        if not priced:
            return variations[0] if variations else None

        def sort_key(variation):
            breaks = cls._variation_breaks(variation)
            return (breaks[0]["qty"], -len(breaks))

        priced.sort(key=sort_key)
        return priced[0]
