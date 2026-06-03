"""Mouser Search API v1 connector.

Auth: API key in the query string (``?apiKey=``). Docs:
https://api.mouser.com/api/docs/ui/index

Endpoints used:
  POST /api/v1/search/partnumber   (search by exact MPN)
  POST /api/v1/search/keyword      (free-text fallback)

Rate limits (community-reported): ~30 req/min, ~1000 req/day. The offer service
caches results to stay well under quota.
"""

from __future__ import annotations

import logging
import re
from typing import Callable, List, Optional

from ...config import settings
from .base import OfferDTO, SupplierConnector

logger = logging.getLogger(__name__)

DEFAULT_BASE_URL = "https://api.mouser.com/api/v1"
_NUMBER_RE = re.compile(r"[-+]?\d[\d\s.,]*")


def _parse_price(raw) -> Optional[float]:
    """Parse a Mouser price string like '0,15 €' or '1.234,56 €' into a float."""
    if raw is None:
        return None
    if isinstance(raw, (int, float)):
        return float(raw)
    match = _NUMBER_RE.search(str(raw))
    if not match:
        return None
    token = match.group(0).strip().replace(" ", "")
    # Normalize EU/US decimal/grouping separators.
    if "," in token and "." in token:
        if token.rfind(",") > token.rfind("."):
            token = token.replace(".", "").replace(",", ".")
        else:
            token = token.replace(",", "")
    elif "," in token:
        token = token.replace(",", ".")
    try:
        return float(token)
    except ValueError:
        return None


def _parse_int(raw) -> Optional[int]:
    if raw is None:
        return None
    if isinstance(raw, (int, float)):
        return int(raw)
    match = re.search(r"\d[\d\s]*", str(raw))
    if not match:
        return None
    try:
        return int(match.group(0).replace(" ", ""))
    except ValueError:
        return None


class MouserConnector(SupplierConnector):
    name = "MOUSER"

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        http_post: Optional[Callable[[str, dict], dict]] = None,
    ):
        # None => fall back to settings; an explicit "" forces "unconfigured" (tests).
        self.api_key = api_key if api_key is not None else settings.mouser_api_key
        self.base_url = (base_url or settings.mouser_api_url or DEFAULT_BASE_URL).rstrip("/")
        self._http_post = http_post  # injectable for tests

    @property
    def is_configured(self) -> bool:
        return bool(self.api_key)

    # --- public API -------------------------------------------------------
    def search_by_mpn(self, mpn: str) -> List[OfferDTO]:
        if not mpn:
            return []
        payload = {
            "SearchByPartRequest": {
                "mouserPartNumber": mpn,
                "partSearchOptions": "Exact",
            }
        }
        data = self._post("/search/partnumber", payload)
        return self._parse_parts(data, expected_mpn=mpn)

    def search_by_keyword(self, keyword: str) -> List[OfferDTO]:
        if not keyword:
            return []
        payload = {
            "SearchByKeywordRequest": {
                "keyword": keyword,
                "records": 10,
                "startingRecord": 0,
                "searchOptions": "",
            }
        }
        data = self._post("/search/keyword", payload)
        return self._parse_parts(data)

    # --- internals --------------------------------------------------------
    def _post(self, path: str, payload: dict) -> dict:
        url = f"{self.base_url}{path}?apiKey={self.api_key}"
        if self._http_post is not None:
            return self._http_post(url, payload)
        import httpx  # imported lazily so the module loads without the dep at rest

        try:
            response = httpx.post(url, json=payload, timeout=15.0)
            response.raise_for_status()
            return response.json()
        except Exception as exc:  # network/parse errors degrade to "no offers"
            logger.warning("Mouser request failed (%s): %s", path, exc)
            return {}

    def _parse_parts(self, data: dict, expected_mpn: Optional[str] = None) -> List[OfferDTO]:
        if not data:
            return []
        if data.get("Errors"):
            logger.warning("Mouser API errors: %s", data["Errors"])
        results = (data.get("SearchResults") or {}).get("Parts") or []
        offers: List[OfferDTO] = []
        for part in results:
            breaks = []
            for brk in part.get("PriceBreaks") or []:
                price = _parse_price(brk.get("Price"))
                qty = _parse_int(brk.get("Quantity"))
                if price is not None and qty is not None:
                    breaks.append({"qty": qty, "price": price})
            breaks.sort(key=lambda b: b["qty"])
            currency = None
            if part.get("PriceBreaks"):
                currency = part["PriceBreaks"][0].get("Currency")
            offers.append(
                OfferDTO(
                    supplier=self.name,
                    supplier_part=part.get("MouserPartNumber"),
                    mpn=part.get("ManufacturerPartNumber"),
                    manufacturer=part.get("Manufacturer"),
                    product_url=part.get("ProductDetailUrl"),
                    datasheet_url=part.get("DataSheetUrl"),
                    currency=currency,
                    unit_price=breaks[0]["price"] if breaks else None,
                    stock_qty=_parse_int(part.get("AvailabilityInStock") or part.get("Availability")),
                    lead_time_days=_parse_int(part.get("LeadTime")),
                    price_breaks=breaks,
                )
            )
        # Prefer exact MPN matches when searching by part number.
        if expected_mpn:
            exact = [o for o in offers if (o.mpn or "").upper() == expected_mpn.upper()]
            if exact:
                return exact
        return offers
