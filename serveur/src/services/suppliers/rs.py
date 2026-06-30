"""RS / RS Components (DigiProc) API connector.

Auth: ``Client-Id`` + ``Client-Secret`` HTTP headers sent on every request (no
OAuth token exchange — the id/secret pair go straight into the headers). All
endpoints expect ``Accept: application/json``; the POST endpoint also sets
``Content-Type: application/json``.

Endpoints (base = ``https://api.rs-online.com/digiproc``), ISO = country code (FR):

  search_by_mpn       GET  /products/V2/COUNTRY_CODE/<ISO>/STORE_ID/<ISO>_1/MPN/<mpn>
  search_by_keyword   GET  /search?countryCode=<ISO>&language=<lang>&query=<kw>&page=1
  get_product         GET  /products/V2/COUNTRY_CODE/<ISO>/STORE_ID/<ISO>_1/Product/<stockNo>
  get_stock           GET  /V2/digiproc/getProductStock/<ISO>?GlobalStock=true&ProductNumber=...
  get_customer_pricing POST /customer-pricing/   (body customerPricesRetrieve, needs customerNumber)

Reference: KELENN TECHNOLOGY "API Setups Completed" spec.

Response schema (confirmed live 2026-06-11 against the FR store): the Product and
MPN endpoints return a SINGLE product object (not a list, not wrapped) with
PascalCase keys::

    {
      "ManufacturerPartNumber": "6ED1057-4BA11-0AA0",
      "Manufacturer": "Siemens",
      "MaterialNumberIntern(SKU)": "0288170",
      "CurrencyCode": "EUR",
      "BreakPrice": [{"Quantity": 1, "PriceNoTax": "394.05"}],
      "AvailableQuantity": null,
      "DMS": {"url": "https://docs.rs-online.com/.../x.pdf", "type": "data_sheet"},
      "LongDescription": "...", "Package": "KT", "MinimumOrderQuantity": 1, ...
    }

There is no product-page URL and no lead-time field in the payload, so those stay
empty (the product URL is reconstructed as an RS search link as a convenience).

CAVEATS (observed live 2026-06-11, FR account):
  * Search API — documented params (countryCode/language/query/page) return HTTP 400
    "required API parameters missing"; RS's published param list is incomplete.
  * Stock API — the documented path ``/V2/digiproc/getProductStock/<ISO>`` returns
    HTTP 404 "No resources match requested URI"; the path/grant is not valid here.
  * Customer-Pricing — not exercised live (needs a customer number).
Each of these degrades gracefully (``[]`` / ``{}``) and awaits correct specs from RS.
The Product and MPN endpoints (the latter drives MPN enrichment) work as implemented.
"""

from __future__ import annotations

import logging
from typing import Callable, List, Optional, Sequence
from urllib.parse import quote

from ...config import settings
from .base import OfferDTO, SupplierConnector

logger = logging.getLogger(__name__)

DEFAULT_BASE_URL = "https://api.rs-online.com/digiproc"
DEFAULT_COUNTRY_CODE = "FR"
DEFAULT_LANGUAGE = "FR_FR"
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


def _first(mapping: dict, *keys, default=None):
    """Return the first present, non-None value among ``keys`` in ``mapping``."""
    if not isinstance(mapping, dict):
        return default
    for key in keys:
        if key in mapping and mapping[key] is not None:
            return mapping[key]
    return default


class RsConnector(SupplierConnector):
    name = "RS"

    def __init__(
        self,
        client_id: Optional[str] = None,
        client_secret: Optional[str] = None,
        base_url: Optional[str] = None,
        country_code: Optional[str] = None,
        language: Optional[str] = None,
        currency: Optional[str] = None,
        customer_number: Optional[str] = None,
        http_get: Optional[Callable[[str, dict, dict], dict]] = None,
        http_post: Optional[Callable[[str, dict, dict], dict]] = None,
    ):
        # None => fall back to settings; an explicit "" forces "unconfigured" (tests).
        self.client_id = client_id if client_id is not None else settings.rs_client_id
        self.client_secret = (
            client_secret if client_secret is not None else settings.rs_client_secret
        )
        self.base_url = (base_url or settings.rs_api_url or DEFAULT_BASE_URL).rstrip("/")
        self.country_code = country_code or settings.rs_country_code or DEFAULT_COUNTRY_CODE
        self.language = language or settings.rs_language or DEFAULT_LANGUAGE
        self.currency = currency or settings.rs_currency or DEFAULT_CURRENCY
        self.customer_number = (
            customer_number if customer_number is not None else settings.rs_customer_number
        )
        self._http_get = http_get  # callable(url, params, headers) -> dict, for tests
        self._http_post = http_post  # callable(url, json_body, headers) -> dict, for tests

    @property
    def is_configured(self) -> bool:
        return bool(self.client_id and self.client_secret)

    # --- public API (SupplierConnector contract) --------------------------
    def search_by_mpn(self, mpn: str) -> List[OfferDTO]:
        if not mpn or not self.is_configured:
            return []
        iso = self.country_code
        path = f"/products/V2/COUNTRY_CODE/{iso}/STORE_ID/{iso}_1/MPN/{mpn}"
        offers = self._parse_products(self._get(path))
        exact = [o for o in offers if (o.mpn or "").upper() == mpn.upper()]
        return exact or offers

    def search_by_keyword(self, keyword: str) -> List[OfferDTO]:
        if not keyword or not self.is_configured:
            return []
        params = {
            "countryCode": self.country_code,
            "language": self.language,
            "query": keyword,
            "page": 1,
        }
        return self._parse_products(self._get("/search", params))

    # --- RS-specific endpoints --------------------------------------------
    def get_product(self, stock_number: str) -> List[OfferDTO]:
        """Look up offers by RS stock number (RS ProductNumber), not MPN."""
        if not stock_number or not self.is_configured:
            return []
        iso = self.country_code
        path = f"/products/V2/COUNTRY_CODE/{iso}/STORE_ID/{iso}_1/Product/{stock_number}"
        return self._parse_products(self._get(path))

    def get_stock(self, product_numbers: Sequence[str], global_stock: bool = True) -> dict:
        """Return raw stock info for a batch of RS ProductNumbers.

        Maps the documented Stock API; the response shape is RS-specific and is
        returned as-is so callers can map it once the real schema is known.
        """
        numbers = [str(n).strip() for n in (product_numbers or []) if str(n).strip()]
        if not numbers or not self.is_configured:
            return {}
        # Repeated ProductNumber query keys, exactly as the spec documents them.
        params: List[tuple] = [("GlobalStock", "true" if global_stock else "false")]
        params += [("ProductNumber", n) for n in numbers]
        path = f"/V2/digiproc/getProductStock/{self.country_code}"
        return self._get(path, params) or {}

    def get_customer_pricing(
        self,
        products: Sequence[dict],
        customer_number: Optional[str] = None,
    ) -> dict:
        """Retrieve negotiated customer pricing (Customer-Pricing POST endpoint).

        ``products`` is a list of ``{"ProductNumber": str, "Quantity": int}``.
        Requires a customer number (arg or ``RS_CUSTOMER_NUMBER``). Returns the raw
        response so callers can map it once the real schema is known.
        """
        customer = customer_number if customer_number is not None else self.customer_number
        items = [p for p in (products or []) if p.get("ProductNumber")]
        if not items or not self.is_configured or not customer:
            return {}
        body = {
            "customerPricesRetrieve": {
                "locationType": "COUNTRY_CODE",
                "locationCode": self.country_code,
                "customerNumber": str(customer),
                "products": items,
            }
        }
        return self._post("/customer-pricing/", body) or {}

    # --- internals --------------------------------------------------------
    def _headers(self, *, json_body: bool = False) -> dict:
        headers = {
            "Client-Id": self.client_id or "",
            "Client-Secret": self.client_secret or "",
            "Accept": "application/json",
        }
        if json_body:
            headers["Content-Type"] = "application/json"
        return headers

    def _get(self, path: str, params=None) -> dict:
        url = f"{self.base_url}{path}"
        params = params or {}
        headers = self._headers()
        if self._http_get is not None:
            return self._http_get(url, params, headers)
        import httpx  # imported lazily so the module loads without the dep at rest

        try:
            response = httpx.get(url, params=params, headers=headers, timeout=15.0)
            response.raise_for_status()
            return response.json()
        except Exception as exc:  # network/parse errors degrade to "no offers"
            logger.warning("RS GET failed (%s): %s", path, exc)
            return {}

    def _post(self, path: str, body: dict) -> dict:
        url = f"{self.base_url}{path}"
        headers = self._headers(json_body=True)
        if self._http_post is not None:
            return self._http_post(url, body, headers)
        import httpx

        try:
            response = httpx.post(url, json=body, headers=headers, timeout=15.0)
            response.raise_for_status()
            return response.json()
        except Exception as exc:
            logger.warning("RS POST failed (%s): %s", path, exc)
            return {}

    # Keys that mark a dict as a single RS product object (confirmed schema).
    _PRODUCT_MARKERS = (
        "ManufacturerPartNumber",
        "MaterialNumberIntern(SKU)",
        "BreakPrice",
        "manufacturerPartNumber",
        "stockNumber",
    )

    @classmethod
    def _extract_products(cls, data) -> List[dict]:
        """Pull the product object(s) out of whichever RS envelope wraps them.

        The Product and MPN endpoints return a single product object. Lists and a
        few wrapper shapes are still handled defensively for other endpoints.
        """
        if not data:
            return []
        if isinstance(data, list):
            return data
        for key in ("products", "Products", "results", "items"):
            value = data.get(key)
            if isinstance(value, list):
                return value
        nested = data.get("data") or data.get("response")
        if isinstance(nested, (dict, list)):
            return cls._extract_products(nested)
        # A single product object (Product / MPN by-id lookups).
        if any(k in data for k in cls._PRODUCT_MARKERS):
            return [data]
        return []

    def _parse_products(self, data: dict) -> List[OfferDTO]:
        products = self._extract_products(data)[:_MAX_RESULTS]
        offers: List[OfferDTO] = []
        for product in products:
            if not isinstance(product, dict):
                continue
            offers.append(self._parse_one(product))
        return offers

    def _parse_one(self, product: dict) -> OfferDTO:
        breaks = self._parse_breaks(product)
        # RS SKU (internal material number) — fallbacks kept for other locales.
        supplier_part = _first(
            product, "MaterialNumberIntern(SKU)", "stockNumber", "productNumber",
            "ProductNumber", "sku",
        )
        manufacturer = _first(
            product, "Manufacturer", "brand", "brandName", "manufacturer", "manufacturerName"
        )
        if isinstance(manufacturer, dict):
            manufacturer = _first(manufacturer, "name", "value")
        # Datasheet lives under DMS.url; keep flat fallbacks too.
        datasheet = _first(product, "DMS", "datasheetUrl", "datasheet", "dataSheetUrl")
        if isinstance(datasheet, dict):
            datasheet = _first(datasheet, "url", "value")
        mpn = _first(product, "ManufacturerPartNumber", "manufacturerPartNumber", "mpn")
        return OfferDTO(
            supplier=self.name,
            supplier_part=str(supplier_part) if supplier_part is not None else None,
            mpn=mpn,
            manufacturer=manufacturer,
            # No product-page URL in the payload — reconstruct an RS search link.
            product_url=self._product_url(mpn),
            datasheet_url=datasheet,
            currency=_first(product, "CurrencyCode", "currency", default=self.currency),
            unit_price=breaks[0]["price"] if breaks else None,
            stock_qty=_to_int(
                _first(product, "AvailableQuantity", "stockQuantity", "availableQuantity",
                       "stock", "quantity")
            ),
            lead_time_days=_to_int(_first(product, "leadTimeDays", "leadTime")),
            price_breaks=breaks,
        )

    def _product_url(self, mpn: Optional[str]) -> Optional[str]:
        """Best-effort RS product link (the API payload carries no product URL)."""
        if not mpn:
            return None
        host = f"{self.country_code.lower()}.rs-online.com"
        return f"https://{host}/web/c/?searchTerm={quote(str(mpn))}"

    @staticmethod
    def _parse_breaks(product: dict) -> List[dict]:
        """Normalize RS price breaks to ``[{"qty", "price"}]`` sorted by qty.

        Confirmed source key is ``BreakPrice`` with ``Quantity`` + ``PriceNoTax``
        (price is a string like ``"394.05"``); fallbacks kept for robustness.
        """
        raw = _first(
            product, "BreakPrice", "priceBreaks", "prices", "pricing", "PriceBreaks", default=[]
        )
        breaks: List[dict] = []
        for entry in raw or []:
            if not isinstance(entry, dict):
                continue
            qty = _to_int(_first(entry, "Quantity", "quantity", "qty", "from", "breakQuantity"))
            price = _to_float(
                _first(entry, "PriceNoTax", "price", "unitPrice", "cost", "value", "amount")
            )
            if qty is not None and price is not None:
                breaks.append({"qty": qty, "price": price})
        breaks.sort(key=lambda b: b["qty"])
        return breaks
