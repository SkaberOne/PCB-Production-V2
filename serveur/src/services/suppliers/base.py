"""Common contract for supplier connectors.

All connectors return a normalized list of :class:`OfferDTO`, so the rest of the
system (cache, sorting, ERP export, UI) never depends on a vendor's payload shape.
See ADR 0004.
"""

from __future__ import annotations

import json
from abc import ABC, abstractmethod
from dataclasses import asdict, dataclass, field
from typing import List, Optional


@dataclass
class OfferDTO:
    """Normalized supplier offer for a single component."""

    supplier: str  # "MOUSER" | "DIGIKEY" | "FARNELL" | "RS"
    supplier_part: Optional[str] = None
    mpn: Optional[str] = None
    manufacturer: Optional[str] = None
    product_url: Optional[str] = None
    datasheet_url: Optional[str] = None
    currency: Optional[str] = None
    unit_price: Optional[float] = None  # price at smallest break (indicative)
    stock_qty: Optional[int] = None
    lead_time_days: Optional[int] = None
    lifecycle_status: Optional[str] = None  # brut fournisseur (normalisé plus tard, ADR 0014)
    price_breaks: List[dict] = field(default_factory=list)  # [{"qty": int, "price": float}]

    def price_for(self, quantity: int) -> Optional[float]:
        """Unit price at the break matching ``quantity`` (else best available)."""
        return price_at_quantity(self.price_breaks, quantity) or self.unit_price

    def price_breaks_json(self) -> str:
        return json.dumps(self.price_breaks or [])

    def to_dict(self) -> dict:
        return asdict(self)


def price_at_quantity(price_breaks: Optional[List[dict]], quantity: int) -> Optional[float]:
    """Return the unit price for ``quantity`` from sorted price breaks.

    Picks the highest break whose threshold is <= quantity. Falls back to the
    cheapest break if quantity is below the smallest threshold.
    """
    if not price_breaks:
        return None
    valid = [b for b in price_breaks if b.get("price") is not None and b.get("qty") is not None]
    if not valid:
        return None
    valid.sort(key=lambda b: b["qty"])
    chosen = valid[0]["price"]
    for brk in valid:
        if brk["qty"] <= quantity:
            chosen = brk["price"]
        else:
            break
    return chosen


class SupplierConnector(ABC):
    """Base class every supplier adapter implements."""

    #: Canonical supplier code stored in SUPPLIER_OFFERS.supplier
    name: str = "UNKNOWN"

    @property
    @abstractmethod
    def is_configured(self) -> bool:
        """True when the connector has the credentials it needs to call the API."""

    @abstractmethod
    def search_by_mpn(self, mpn: str) -> List[OfferDTO]:
        """Return offers matching an exact manufacturer part number."""

    def search_by_keyword(self, keyword: str) -> List[OfferDTO]:  # pragma: no cover - optional
        """Return offers matching a free-text keyword. Override if supported."""
        return []
