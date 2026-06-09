"""Production costing service — « Prix carte à la production ».

Computes the cost of revient of a produced card (matière + main d'œuvre + frais
fixes), in HT/TTC, and persists snapshots that double as a per-card price history
(latest snapshot per card = reference price). See ADR 0005 / audit 2026-06-09.

Design (audit §6): coût de revient seul (no margin), single burdened labor rate,
hybrid assembly time (auto estimate, overridable), aggregated TOP+BOT price.

Material is never re-entered: it is derived from BOM_ITEMS → COMPONENTS →
SUPPLIER_OFFERS (price at the produced quantity), reusing the existing matching
and offer-selection services.
"""

from __future__ import annotations

import json
from typing import Dict, List, Optional

from sqlalchemy.orm import Session

from ..database import utcnow
from ..models.bom import BomReference, Component
from ..models.costing import CostParameters, ProductionCostInput, ProductionCosting
from ..models.production import Production
from .component_library_service import ComponentLibraryService
from .supplier_offer_service import SupplierOfferService
from .suppliers.base import price_at_quantity

# Heuristic for the *auto* assembly-time estimate when no manual override is set.
# Replaced by the operator's value as soon as they type one (hybrid mode). Kept as a
# module constant (not a DB param) to honour the ADR-0005 schema as approved.
DEFAULT_SECONDS_PER_PLACEMENT = 4.0

PARAM_FIELDS = (
    "labor_rate",
    "vat_pct",
    "solder_paste_per_board",
    "defect_rate_pct",
    "repair_time_h",
    "test_time_h",
    "prep_time_bom_h",
    "prep_time_top_h",
    "prep_time_bot_h",
)

INPUT_FIELDS = (
    "quantity_produced",
    "pcb_total_price",
    "stencil_cost",
    "amortize_stencil",
    "assembly_time_top_h",
    "assembly_time_bot_h",
    "tht_time_h",
)


class CostingService:
    # ------------------------------------------------------------ parameters
    @staticmethod
    def get_or_seed_parameters(db: Session) -> CostParameters:
        row = db.query(CostParameters).order_by(CostParameters.id).first()
        if row is None:
            row = CostParameters()
            db.add(row)
            db.commit()
            db.refresh(row)
        return row

    @classmethod
    def parameters_as_dict(cls, db: Session) -> Dict:
        row = cls.get_or_seed_parameters(db)
        return {f: getattr(row, f) for f in PARAM_FIELDS}

    @classmethod
    def update_parameters(cls, db: Session, values: Dict) -> Dict:
        row = cls.get_or_seed_parameters(db)
        for f in PARAM_FIELDS:
            if values.get(f) is not None:
                setattr(row, f, values[f])
        db.commit()
        db.refresh(row)
        return {f: getattr(row, f) for f in PARAM_FIELDS}

    # ----------------------------------------------------------- prod inputs
    @staticmethod
    def get_or_create_input(db: Session, production_id: int) -> ProductionCostInput:
        row = (
            db.query(ProductionCostInput)
            .filter(ProductionCostInput.production_id == production_id)
            .first()
        )
        if row is None:
            row = ProductionCostInput(production_id=production_id)
            db.add(row)
            db.commit()
            db.refresh(row)
        return row

    @classmethod
    def input_as_dict(cls, db: Session, production_id: int) -> Dict:
        row = cls.get_or_create_input(db, production_id)
        return {f: getattr(row, f) for f in INPUT_FIELDS}

    @classmethod
    def update_input(cls, db: Session, production_id: int, values: Dict) -> Dict:
        row = cls.get_or_create_input(db, production_id)
        for f in INPUT_FIELDS:
            if f in values:
                setattr(row, f, values[f])
        db.commit()
        db.refresh(row)
        return {f: getattr(row, f) for f in INPUT_FIELDS}

    # --------------------------------------------------------------- compute
    @classmethod
    def _card_links(cls, production: Production, bom_reference_id: int) -> List:
        """ProductionBomRevision links of `production` that belong to a given card."""
        return [
            link
            for link in production.bom_links
            if link.revision is not None and link.revision.bom_ref_id == bom_reference_id
        ]

    @classmethod
    def _resolve_quantity(cls, links: List, cinput: ProductionCostInput) -> int:
        if cinput.quantity_produced and cinput.quantity_produced > 0:
            return cinput.quantity_produced
        qtys = [link.quantity_to_produce or 0 for link in links]
        return max(qtys) if qtys and max(qtys) > 0 else 1

    @classmethod
    def _material_per_board(
        cls, db: Session, links: List, quantity: int, lookup: Dict
    ) -> Dict:
        """Sum component cost for one board across the card's TOP+BOT revisions.

        Returns {cost, lines, missing}. Price is taken at the produced quantity so
        that supplier price breaks apply. Unpriced/unmatched lines are reported, not
        silently zeroed (fixes the Excel SUMPRODUCT-ignores-text bug)."""
        cost = 0.0
        missing: List[str] = []
        priced_lines = 0
        total_lines = 0

        # First pass: collect matched components to fetch offers in one query.
        item_matches = []  # (bom_item, component or None)
        comp_ids = set()
        for link in links:
            rev = link.revision
            for item in rev.items:
                if getattr(item, "dnp", False):
                    continue
                total_lines += 1
                comp = ComponentLibraryService.match_bom_item(lookup, item)
                item_matches.append((item, comp))
                if comp is not None:
                    comp_ids.add(comp.id)

        offers_by_comp = SupplierOfferService.get_offers(db, list(comp_ids)) if comp_ids else {}

        for item, comp in item_matches:
            qty_per_board = item.quantity or 1
            label = item.reference_item or (item.value_harmonized or item.value_raw or "?")
            if comp is None:
                missing.append(f"{label} (non apparié)")
                continue
            offers = offers_by_comp.get(comp.id, [])
            order_qty = max(qty_per_board * quantity, 1)
            best = SupplierOfferService.select_best(offers, quantity=order_qty)
            unit = None
            if best is not None:
                unit = price_at_quantity(best.get("price_breaks"), order_qty)
                if unit is None:
                    unit = best.get("unit_price")
            if unit is None:
                missing.append(f"{label} (sans prix)")
                continue
            cost += qty_per_board * unit
            priced_lines += 1

        return {
            "cost": cost,
            "missing": missing,
            "priced_lines": priced_lines,
            "total_lines": total_lines,
        }

    @staticmethod
    def _auto_assembly_hours(links: List, side: str) -> float:
        """Auto estimate: placements on a face × default cadence. Overridable."""
        placements = 0
        for link in links:
            rev = link.revision
            if rev.type is not None and getattr(rev.type, "value", rev.type) != side:
                continue
            for item in rev.items:
                if getattr(item, "dnp", False):
                    continue
                placements += item.quantity or 1
        return placements * DEFAULT_SECONDS_PER_PLACEMENT / 3600.0

    @classmethod
    def compute_card(
        cls,
        db: Session,
        production: Production,
        bom_reference_id: int,
        params: CostParameters,
        cinput: ProductionCostInput,
        lookup: Optional[Dict] = None,
    ) -> Dict:
        """Pure-ish costing of one card within a production (no DB writes)."""
        if lookup is None:
            lookup = ComponentLibraryService.build_lookup(db.query(Component).all())
        links = cls._card_links(production, bom_reference_id)
        quantity = cls._resolve_quantity(links, cinput)

        mat = cls._material_per_board(db, links, quantity, lookup)
        components = mat["cost"]
        paste = params.solder_paste_per_board or 0.0
        pcb_board = (cinput.pcb_total_price or 0.0) / quantity if quantity else 0.0
        stencil_total = cinput.stencil_cost or 0.0
        stencil_board = (stencil_total / quantity) if (cinput.amortize_stencil and quantity) else stencil_total
        material_cost = components + paste + pcb_board + stencil_board

        asm_top = cinput.assembly_time_top_h
        if asm_top is None:
            asm_top = cls._auto_assembly_hours(links, "TOP")
        asm_bot = cinput.assembly_time_bot_h
        if asm_bot is None:
            asm_bot = cls._auto_assembly_hours(links, "BOT")
        tht = cinput.tht_time_h or 0.0

        prep_total = (params.prep_time_bom_h or 0) + (params.prep_time_top_h or 0) + (params.prep_time_bot_h or 0)
        prep_board = prep_total / quantity if quantity else 0.0
        rework = (params.defect_rate_pct or 0) / 100.0 * (params.repair_time_h or 0)
        time_total = prep_board + asm_top + asm_bot + tht + (params.test_time_h or 0) + rework
        labor_cost = time_total * (params.labor_rate or 0)

        unit_ht = material_cost + labor_cost
        vat = (params.vat_pct or 0) / 100.0
        unit_ttc = unit_ht * (1 + vat)
        nre_cost = stencil_board + prep_board * (params.labor_rate or 0)  # informational subset

        return {
            "bom_reference_id": bom_reference_id,
            "quantity": quantity,
            "material": {
                "components": round(components, 4),
                "paste": round(paste, 4),
                "pcb_per_board": round(pcb_board, 4),
                "stencil_per_board": round(stencil_board, 4),
                "amortize_stencil": bool(cinput.amortize_stencil),
                "subtotal": round(material_cost, 4),
                "missing": mat["missing"],
                "priced_lines": mat["priced_lines"],
                "total_lines": mat["total_lines"],
                "complete": len(mat["missing"]) == 0,
            },
            "labor": {
                "prep_h": round(prep_board, 4),
                "assembly_top_h": round(asm_top, 4),
                "assembly_bot_h": round(asm_bot, 4),
                "tht_h": round(tht, 4),
                "test_h": round(params.test_time_h or 0, 4),
                "rework_h": round(rework, 4),
                "time_total_h": round(time_total, 4),
                "labor_rate": params.labor_rate,
                "subtotal": round(labor_cost, 4),
                "top_auto": cinput.assembly_time_top_h is None,
                "bot_auto": cinput.assembly_time_bot_h is None,
            },
            "nre_cost": round(nre_cost, 4),
            "unit_cost_ht": round(unit_ht, 2),
            "unit_cost_ttc": round(unit_ttc, 2),
            "total_ht": round(unit_ht * quantity, 2),
            "total_ttc": round(unit_ttc * quantity, 2),
        }

    @classmethod
    def _card_ids_of_production(cls, production: Production) -> List[int]:
        seen, ordered = set(), []
        for link in production.bom_links:
            if link.revision is None:
                continue
            rid = link.revision.bom_ref_id
            if rid not in seen:
                seen.add(rid)
                ordered.append(rid)
        return ordered

    @classmethod
    def compute_production(cls, db: Session, production_id: int) -> Dict:
        """Live costing of every card of a production + lot totals."""
        production = db.query(Production).filter(Production.id == production_id).first()
        if production is None:
            raise ValueError(f"Production {production_id} introuvable")
        params = cls.get_or_seed_parameters(db)
        cinput = cls.get_or_create_input(db, production_id)
        lookup = ComponentLibraryService.build_lookup(db.query(Component).all())

        cards = []
        for rid in cls._card_ids_of_production(production):
            ref = db.query(BomReference).filter(BomReference.id == rid).first()
            card = cls.compute_card(db, production, rid, params, cinput, lookup)
            card["reference"] = ref.reference if ref else f"#{rid}"
            cards.append(card)

        total_ht = round(sum(c["total_ht"] for c in cards), 2)
        total_ttc = round(sum(c["total_ttc"] for c in cards), 2)
        return {
            "production_id": production_id,
            "production_name": production.name,
            "parameters": {f: getattr(params, f) for f in PARAM_FIELDS},
            "inputs": {f: getattr(cinput, f) for f in INPUT_FIELDS},
            "cards": cards,
            "total_ht": total_ht,
            "total_ttc": total_ttc,
        }

    # -------------------------------------------------------------- snapshot
    @classmethod
    def snapshot_production(cls, db: Session, production_id: int) -> Dict:
        """Freeze the costing of every card of a production into the price history."""
        result = cls.compute_production(db, production_id)
        params_snapshot = json.dumps(
            {"parameters": result["parameters"], "inputs": result["inputs"]}, default=str
        )
        written = []
        for card in result["cards"]:
            rid = card["bom_reference_id"]
            # Demote previous references for this card.
            db.query(ProductionCosting).filter(
                ProductionCosting.bom_reference_id == rid,
                ProductionCosting.is_reference.is_(True),
            ).update({ProductionCosting.is_reference: False})
            row = ProductionCosting(
                bom_reference_id=rid,
                production_id=production_id,
                quantity=card["quantity"],
                unit_cost_ht=card["unit_cost_ht"],
                unit_cost_ttc=card["unit_cost_ttc"],
                total_ht=card["total_ht"],
                total_ttc=card["total_ttc"],
                material_cost=card["material"]["subtotal"],
                labor_cost=card["labor"]["subtotal"],
                nre_cost=card["nre_cost"],
                is_reference=True,
                computed_at=utcnow().replace(tzinfo=None),
                params_snapshot=params_snapshot,
            )
            db.add(row)
            written.append(rid)
        db.commit()
        return {"production_id": production_id, "snapshotted_cards": written}

    # --------------------------------------------------------------- history
    @classmethod
    def card_history(cls, db: Session, bom_reference_id: int) -> Dict:
        ref = db.query(BomReference).filter(BomReference.id == bom_reference_id).first()
        rows = (
            db.query(ProductionCosting)
            .filter(ProductionCosting.bom_reference_id == bom_reference_id)
            .order_by(ProductionCosting.computed_at.desc())
            .all()
        )
        history = [
            {
                "id": r.id,
                "production_id": r.production_id,
                "quantity": r.quantity,
                "unit_cost_ht": r.unit_cost_ht,
                "unit_cost_ttc": r.unit_cost_ttc,
                "total_ht": r.total_ht,
                "is_reference": r.is_reference,
                "computed_at": r.computed_at.isoformat() if r.computed_at else None,
            }
            for r in rows
        ]
        reference = next((h for h in history if h["is_reference"]), history[0] if history else None)
        return {
            "bom_reference_id": bom_reference_id,
            "reference_name": ref.reference if ref else None,
            "reference_price": reference,
            "history": history,
        }

    @classmethod
    def list_cards(cls, db: Session) -> List[Dict]:
        """Cards selectable in the UI: every BOM reference + its latest reference price."""
        refs = db.query(BomReference).order_by(BomReference.reference).all()
        out = []
        for ref in refs:
            latest = (
                db.query(ProductionCosting)
                .filter(
                    ProductionCosting.bom_reference_id == ref.id,
                    ProductionCosting.is_reference.is_(True),
                )
                .order_by(ProductionCosting.computed_at.desc())
                .first()
            )
            out.append(
                {
                    "bom_reference_id": ref.id,
                    "reference": ref.reference,
                    "reference_unit_cost_ht": latest.unit_cost_ht if latest else None,
                    "reference_computed_at": latest.computed_at.isoformat()
                    if latest and latest.computed_at
                    else None,
                }
            )
        return out
