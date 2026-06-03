"""Supplier offers orchestration: cache read/write, refresh, sorting.

Default reads come from the SUPPLIER_OFFERS cache (fast, quota-friendly). A refresh
calls the configured connectors and upserts the cache. See ADR 0004 and
docs/audits/Audit_2026-06-03_integration_api_fournisseurs.md.
"""

from __future__ import annotations

import json
import logging
from datetime import timedelta
from typing import Dict, List, Optional, Sequence

from sqlalchemy.orm import Session

from ..config import settings
from ..database import utcnow
from ..models.bom import Component
from ..models.commands import SupplierOffer
from .suppliers import build_connectors
from .suppliers.base import OfferDTO, price_at_quantity

logger = logging.getLogger(__name__)


class SupplierOfferService:
    """Read/refresh cached supplier offers and pick the best one per component."""

    # ------------------------------------------------------------------ cache
    @staticmethod
    def _ttl() -> timedelta:
        return timedelta(hours=max(int(settings.supplier_offer_ttl_hours or 24), 0))

    @classmethod
    def _is_stale(cls, offer: SupplierOffer) -> bool:
        if offer.fetched_at is None:
            return True
        fetched = offer.fetched_at
        # Compare in UTC; stored values are naive UTC.
        now = utcnow().replace(tzinfo=None)
        return (now - fetched) > cls._ttl()

    @classmethod
    def _offer_to_dict(cls, offer: SupplierOffer) -> Dict:
        try:
            breaks = json.loads(offer.price_breaks) if offer.price_breaks else []
        except (ValueError, TypeError):
            breaks = []
        return {
            "id": offer.id,
            "component_id": offer.component_id,
            "supplier": offer.supplier,
            "supplier_part": offer.supplier_part,
            "mpn": offer.mpn,
            "manufacturer": offer.manufacturer,
            "product_url": offer.product_url,
            "datasheet_url": offer.datasheet_url,
            "currency": offer.currency,
            "unit_price": offer.unit_price,
            "stock_qty": offer.stock_qty,
            "lead_time_days": offer.lead_time_days,
            "price_breaks": breaks,
            "fetched_at": offer.fetched_at.isoformat() if offer.fetched_at else None,
            "stale": cls._is_stale(offer),
        }

    @classmethod
    def get_offers(cls, db: Session, component_ids: Sequence[int]) -> Dict[int, List[Dict]]:
        """Return cached offers grouped by component id."""
        result: Dict[int, List[Dict]] = {cid: [] for cid in component_ids}
        if not component_ids:
            return result
        offers = (
            db.query(SupplierOffer)
            .filter(SupplierOffer.component_id.in_(list(component_ids)))
            .all()
        )
        for offer in offers:
            result.setdefault(offer.component_id, []).append(cls._offer_to_dict(offer))
        return result

    # ---------------------------------------------------------------- refresh
    @classmethod
    def refresh_offers(
        cls,
        db: Session,
        component_ids: Sequence[int],
        connectors=None,
    ) -> Dict[int, List[Dict]]:
        """Call the supplier APIs for the given components and upsert the cache."""
        connectors = build_connectors() if connectors is None else connectors
        if not connectors:
            logger.info("No supplier connector configured; returning cache as-is.")
            return cls.get_offers(db, component_ids)

        components = (
            db.query(Component).filter(Component.id.in_(list(component_ids))).all()
        )
        for component in components:
            query_mpn = (component.mpn or "").strip()
            query_keyword = (component.value or "").strip()
            for connector in connectors:
                try:
                    offers = (
                        connector.search_by_mpn(query_mpn)
                        if query_mpn
                        else connector.search_by_keyword(query_keyword)
                    )
                except Exception as exc:  # never let one supplier break the loop
                    logger.warning("Connector %s failed: %s", connector.name, exc)
                    continue
                best = cls._pick_primary_offer(offers)
                if best is not None:
                    cls._upsert_offer(db, component.id, best)
        db.commit()
        return cls.get_offers(db, component_ids)

    @staticmethod
    def _pick_primary_offer(offers: List[OfferDTO]) -> Optional[OfferDTO]:
        """From a connector's results, keep the most relevant single offer."""
        if not offers:
            return None
        in_stock = [o for o in offers if (o.stock_qty or 0) > 0 and o.unit_price is not None]
        pool = in_stock or [o for o in offers if o.unit_price is not None] or offers
        pool.sort(key=lambda o: (o.unit_price is None, o.unit_price or float("inf")))
        return pool[0]

    @classmethod
    def _upsert_offer(cls, db: Session, component_id: int, dto: OfferDTO) -> None:
        offer = (
            db.query(SupplierOffer)
            .filter(
                SupplierOffer.component_id == component_id,
                SupplierOffer.supplier == dto.supplier,
            )
            .first()
        )
        if offer is None:
            offer = SupplierOffer(component_id=component_id, supplier=dto.supplier)
            db.add(offer)
        offer.supplier_part = dto.supplier_part
        offer.mpn = dto.mpn
        offer.manufacturer = dto.manufacturer
        offer.product_url = dto.product_url
        offer.datasheet_url = dto.datasheet_url
        offer.currency = dto.currency
        offer.unit_price = dto.unit_price
        offer.stock_qty = dto.stock_qty
        offer.lead_time_days = dto.lead_time_days
        offer.price_breaks = dto.price_breaks_json()
        offer.fetched_at = utcnow().replace(tzinfo=None)

    # ------------------------------------------------------------------- sort
    @staticmethod
    def select_best(
        offers: List[Dict],
        quantity: int = 1,
        strategy: str = "cheapest",
        priority_supplier: Optional[str] = None,
    ) -> Optional[Dict]:
        """Pick the retained offer for one component according to the strategy.

        - ``cheapest``: lowest unit price at the matching break, in-stock first.
        - ``priority``: the priority supplier if available, else cheapest in stock.
        """
        if not offers:
            return None

        def effective_price(offer: Dict) -> float:
            price = price_at_quantity(offer.get("price_breaks"), quantity)
            if price is None:
                price = offer.get("unit_price")
            return price if price is not None else float("inf")

        def in_stock(offer: Dict) -> bool:
            return (offer.get("stock_qty") or 0) >= quantity

        if strategy == "priority" and priority_supplier:
            preferred = [
                o for o in offers
                if (o.get("supplier") or "").upper() == priority_supplier.upper()
                and in_stock(o)
            ]
            if preferred:
                preferred.sort(key=effective_price)
                return preferred[0]

        ranked = sorted(
            offers,
            key=lambda o: (not in_stock(o), effective_price(o), o.get("lead_time_days") or 9999),
        )
        return ranked[0]

    # --------------------------------------------------------- MPN enrichment
    @classmethod
    def mpn_proposals(cls, db: Session, component_ids: Optional[Sequence[int]] = None) -> List[Dict]:
        """List components whose MPN is empty but a supplier offer provides one.

        Review mode: nothing is written until ``apply_mpn`` is called.
        """
        query = db.query(Component)
        if component_ids:
            query = query.filter(Component.id.in_(list(component_ids)))
        proposals: List[Dict] = []
        for component in query.all():
            if (component.mpn or "").strip():
                continue  # never overwrite an existing MPN
            offers = (
                db.query(SupplierOffer)
                .filter(SupplierOffer.component_id == component.id, SupplierOffer.mpn.isnot(None))
                .all()
            )
            best = next((o for o in offers if (o.mpn or "").strip()), None)
            if best is None:
                continue
            proposals.append(
                {
                    "component_id": component.id,
                    "reference": component.reference,
                    "value": component.value,
                    "current_mpn": component.mpn,
                    "proposed_mpn": best.mpn,
                    "manufacturer": best.manufacturer,
                    "supplier": best.supplier,
                }
            )
        return proposals

    @classmethod
    def apply_mpn(cls, db: Session, component_id: int, mpn: str) -> bool:
        """Write a reviewed MPN onto a component (only if currently empty)."""
        component = db.query(Component).filter(Component.id == component_id).first()
        if component is None:
            return False
        if (component.mpn or "").strip():
            return False  # do not overwrite manual entries
        component.mpn = mpn.strip()
        db.commit()
        return True

    @classmethod
    def best_offers_for_components(
        cls,
        db: Session,
        component_quantities: Dict[int, int],
        strategy: str = "cheapest",
        priority_supplier: Optional[str] = None,
    ) -> Dict[int, Optional[Dict]]:
        """Return the retained offer per component id, using the cache."""
        offers_by_component = cls.get_offers(db, list(component_quantities.keys()))
        result: Dict[int, Optional[Dict]] = {}
        for component_id, quantity in component_quantities.items():
            result[component_id] = cls.select_best(
                offers_by_component.get(component_id, []),
                quantity=quantity or 1,
                strategy=strategy,
                priority_supplier=priority_supplier,
            )
        return result
