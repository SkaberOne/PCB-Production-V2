"""Supplier offers orchestration: cache read/write, refresh, sorting.

Default reads come from the SUPPLIER_OFFERS cache (fast, quota-friendly). A refresh
calls the configured connectors and upserts the cache. See ADR 0004 and
docs/audits/Audit_2026-06-03_integration_api_fournisseurs.md.
"""

from __future__ import annotations

import json
import logging
import re
from datetime import timedelta
from typing import Dict, List, Optional, Sequence

from sqlalchemy.orm import Session

from ..config import settings
from ..database import utcnow
from ..models.bom import Component
from ..models.commands import SupplierOffer
from . import lifecycle
from .suppliers import build_connectors
from .suppliers.base import OfferDTO, price_at_quantity

logger = logging.getLogger(__name__)

# Default number of empty-MPN components examined per live enrichment run. Keeps
# us well under Mouser's ~30 req/min quota when combined with Mouser-first lookup.
DEFAULT_ENRICH_LIMIT = 25

_WHITESPACE_RE = re.compile(r"\s+")
_NON_ALNUM_RE = re.compile(r"[^a-z0-9]")
# value/voltage style generics (e.g. "100uF/50V", "10uF/50V") that *look* like a
# reference but are not a real MPN.
_VALUE_VOLTAGE_RE = re.compile(r"\d+\s*(u|n|p|µ|m)?f", re.IGNORECASE)


def _normalize_mpn(value: Optional[str]) -> str:
    """Upper-case, whitespace-stripped form used for exact MPN comparison."""
    return _WHITESPACE_RE.sub("", (value or "").strip()).upper()


def _normalize_package(package: Optional[str]) -> str:
    """Compact alphanumeric form so '0603', 'SOT-23-3' compare cleanly."""
    return _NON_ALNUM_RE.sub("", (package or "").lower())


def _looks_like_mpn(value: Optional[str]) -> bool:
    """Heuristic: the ``value`` is probably already a real part number.

    Conservative on purpose — a false "yes" only triggers an exact-match lookup
    that fails and falls back to the keyword path, so it never writes anything.
    """
    candidate = (value or "").strip()
    if len(candidate) < 6:
        return False
    has_digit = any(c.isdigit() for c in candidate)
    has_alpha = any(c.isalpha() for c in candidate)
    if not (has_digit and has_alpha):
        return False
    # "100uF/50V" and friends are generic value/voltage pairs, not part numbers.
    if "/" in candidate and _VALUE_VOLTAGE_RE.search(candidate):
        return False
    return len(candidate) >= 7 or "-" in candidate


def _keyword_for(component: Component) -> str:
    """Keyword query biased by package so results stay footprint-relevant."""
    parts = [component.value or ""]
    if component.package:
        parts.append(component.package)
    return " ".join(part for part in parts if part).strip()


# Non-component placeholders that must never receive an MPN proposal:
# NC = not connected, DNP = do not populate.
_PLACEHOLDER_VALUES = {"NC", "DNP"}


def _is_placeholder_value(value: Optional[str]) -> bool:
    """True for placeholder values (NC/DNP, any case) — skip enrichment entirely."""
    return (value or "").strip().upper() in _PLACEHOLDER_VALUES


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
            lifecycle_raw: List[str] = []  # statuts bruts collectés (ADR 0014)
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
                for offer in offers:
                    if getattr(offer, "lifecycle_status", None):
                        lifecycle_raw.append(offer.lifecycle_status)
                best = cls._pick_primary_offer(offers)
                if best is not None:
                    cls._upsert_offer(db, component.id, best)
            # Cycle de vie (ADR 0014) : agrégation pire-cas. On ne clobber pas un
            # statut connu si aucune donnée n'est revenue ; on horodate le check.
            normalized = [lifecycle.normalize_lifecycle(r) for r in lifecycle_raw]
            if any(s != lifecycle.UNKNOWN for s in normalized):
                component.lifecycle_status = lifecycle.worst_case(normalized)
            component.lifecycle_checked_at = utcnow()
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
    def apply_mpn_batch(cls, db: Session, items: Sequence[Dict]) -> Dict[str, List[Dict]]:
        """Apply many reviewed MPNs at once (e.g. all HIGH-confidence proposals).

        Each item is ``{"component_id": int, "mpn": str}``. Existing MPNs are
        never overwritten; one commit covers the whole batch.
        """
        applied: List[Dict] = []
        skipped: List[Dict] = []
        _ids = [it.get("component_id") for it in items if it.get("component_id")]
        _components_by_id = {
            c.id: c
            for c in db.query(Component).filter(Component.id.in_(_ids)).all()
        } if _ids else {}
        for item in items:
            component_id = item.get("component_id")
            mpn = (item.get("mpn") or "").strip()
            if not component_id or not mpn:
                skipped.append({"component_id": component_id, "reason": "missing_data"})
                continue
            component = _components_by_id.get(component_id)
            if component is None:
                skipped.append({"component_id": component_id, "reason": "not_found"})
                continue
            if (component.mpn or "").strip():
                skipped.append({"component_id": component_id, "reason": "already_set"})
                continue
            component.mpn = mpn
            applied.append({"component_id": component_id, "mpn": mpn})
        db.commit()
        return {"applied": applied, "skipped": skipped}

    # ------------------------------------------------ tiered MPN proposals
    @staticmethod
    def _candidate_from_offer(offer) -> Dict:
        """Normalize a SupplierOffer row or an OfferDTO into a candidate dict."""
        return {
            "mpn": offer.mpn,
            "manufacturer": offer.manufacturer,
            "supplier": offer.supplier,
            "product_url": offer.product_url,
            "datasheet_url": getattr(offer, "datasheet_url", None),
            "stock_qty": offer.stock_qty,
            "unit_price": offer.unit_price,
        }

    @classmethod
    def _candidates_from_records(cls, records) -> List[Dict]:
        return [cls._candidate_from_offer(r) for r in records if (r.mpn or "").strip()]

    @staticmethod
    def _rank_candidates(candidates: List[Dict]) -> List[Dict]:
        """In-stock first, then priced, then cheapest."""
        return sorted(
            candidates,
            key=lambda c: (
                not ((c.get("stock_qty") or 0) > 0),
                c.get("unit_price") is None,
                c.get("unit_price") if c.get("unit_price") is not None else float("inf"),
            ),
        )

    @staticmethod
    def _exact_match(value: str, candidates: List[Dict]) -> Optional[Dict]:
        target = _normalize_mpn(value)
        if not target:
            return None
        for candidate in candidates:
            if _normalize_mpn(candidate.get("mpn")) == target:
                return candidate
        return None

    @classmethod
    def _live_lookup(cls, connectors, *, mpn: Optional[str] = None, keyword: Optional[str] = None) -> Dict:
        """Query connectors (Mouser-first, stop at first hit) for MPN candidates.

        Returns ``{"candidates": [...], "called": bool}``. ``called`` is True as
        soon as one connector was actually queried, so the caller can decrement a
        quota budget. Connector failures degrade to "no candidates".
        """
        candidates: List[Dict] = []
        called = False
        for connector in connectors:
            try:
                offers = (
                    connector.search_by_mpn(mpn)
                    if mpn
                    else connector.search_by_keyword(keyword or "")
                )
                called = True
            except Exception as exc:  # never let one supplier break enrichment
                logger.warning("Connector %s failed: %s", getattr(connector, "name", "?"), exc)
                continue
            found = cls._candidates_from_records(offers)
            if found:
                candidates.extend(found)
                break  # Mouser-first: don't burn quota on a second supplier
        return {"candidates": candidates, "called": called}

    @classmethod
    def _manual_proposal(cls, component: Component) -> Dict:
        return cls._build_proposal(component, None, confidence="manual", source="manual", candidates=[])

    @staticmethod
    def _build_proposal(
        component: Component,
        chosen: Optional[Dict],
        *,
        confidence: str,
        source: str,
        candidates: List[Dict],
    ) -> Dict:
        chosen = chosen or {}
        return {
            "component_id": component.id,
            "reference": component.reference,
            "value": component.value,
            "package": component.package,
            "component_type": component.component_type,
            "current_mpn": component.mpn,
            "proposed_mpn": chosen.get("mpn"),
            "manufacturer": chosen.get("manufacturer"),
            "supplier": chosen.get("supplier"),
            "product_url": chosen.get("product_url"),
            "stock_qty": chosen.get("stock_qty"),
            "confidence": confidence,  # "high" | "medium" | "manual"
            "source": source,          # "exact_mpn" | "keyword_package" | "manual"
            "candidates": candidates,
        }

    @classmethod
    def build_mpn_proposals(
        cls,
        db: Session,
        *,
        component_ids: Optional[Sequence[int]] = None,
        live: bool = False,
        limit: Optional[int] = DEFAULT_ENRICH_LIMIT,
        connectors=None,
    ) -> List[Dict]:
        """Build reviewable MPN proposals tagged by confidence tier.

        - ``high``   : ``value`` is a real MPN confirmed by an exact supplier match.
        - ``medium`` : generic ``value``; keyword+package search yields candidates.
        - ``manual`` : nothing reliable found; left for manual entry.

        ``live=False`` (default) only reads the SUPPLIER_OFFERS cache — no API
        calls, no quota cost. ``live=True`` queries the connectors, bounded by
        ``limit`` components per run to respect supplier quotas. Nothing is ever
        written here; callers apply a reviewed MPN via :meth:`apply_mpn`.
        """
        if live and connectors is None:
            connectors = [c for c in build_connectors() if c.is_configured]
        elif connectors is None:
            connectors = []

        query = db.query(Component)
        if component_ids:
            query = query.filter(Component.id.in_(list(component_ids)))
        components = [c for c in query.all() if not (c.mpn or "").strip()]
        if limit is not None and limit >= 0:
            components = components[:limit]

        proposals: List[Dict] = []
        for component in components:
            value = (component.value or "").strip()
            if not value or _is_placeholder_value(value):
                # Empty or NC/DNP placeholder: no real part to look up.
                proposals.append(cls._manual_proposal(component))
                continue

            cached = (
                db.query(SupplierOffer)
                .filter(SupplierOffer.component_id == component.id, SupplierOffer.mpn.isnot(None))
                .all()
            )
            cached_candidates = cls._candidates_from_records(cached)

            proposal: Optional[Dict] = None

            # HIGH: confirm the value as an exact manufacturer part number.
            if _looks_like_mpn(value):
                exact = cls._exact_match(value, cached_candidates)
                if exact is None and live and connectors:
                    fetched = cls._live_lookup(connectors, mpn=value)
                    exact = cls._exact_match(value, fetched["candidates"])
                if exact is not None:
                    proposal = cls._build_proposal(
                        component, exact, confidence="high", source="exact_mpn", candidates=[exact]
                    )

            # MEDIUM: keyword+package search, ranked candidates to validate.
            if proposal is None:
                candidates = cls._rank_candidates(cached_candidates)
                if not candidates and live and connectors:
                    fetched = cls._live_lookup(connectors, keyword=_keyword_for(component))
                    candidates = cls._rank_candidates(fetched["candidates"])
                if candidates:
                    proposal = cls._build_proposal(
                        component,
                        candidates[0],
                        confidence="medium",
                        source="keyword_package",
                        candidates=candidates[:5],
                    )

            proposals.append(proposal or cls._manual_proposal(component))

        return proposals

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
