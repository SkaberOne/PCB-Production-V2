"""Phase 2 stock logic: production close (OUT), reservations, "can I produce?".

See docs/adr/0011-cloture-production-reservation-stock.md. Reuses the Phase 1
StockService invariants (idempotent, reversible movements) and the existing
component-library matching. Timestamps via utcnow(); boolean filters use
``== False  # noqa: E712`` (SQL-Server safe).
"""

from __future__ import annotations

import math
from typing import Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from ..models.bom import Component
from ..models.production import Production, ProductionRun
from ..models.stock import ComponentStock
from .component_library_service import ComponentLibraryService
from .stock_service import StockService

_ACTIVE_STATUSES = (Production.StatusEnum.DRAFT, Production.StatusEnum.ACTIVE)


class ProductionStockService:
    """Consumption, reservations and shortage anticipation for productions."""

    # ------------------------------------------------------------- helpers
    @staticmethod
    def _effective_loss_pct(db: Session, component_id: int, settings) -> float:
        row = (
            db.query(ComponentStock)
            .filter(ComponentStock.component_id == component_id)
            .first()
        )
        if row is not None and row.loss_pct is not None:
            return float(row.loss_pct)
        return float(settings.global_loss_pct or 0.0)

    @staticmethod
    def board_count(production: Production) -> int:
        """Planned boards for a production = shared quantity (max over its revisions)."""
        values = [int(link.quantity_to_produce or 0) for link in production.bom_links]
        return max(values) if values else 0

    @classmethod
    def aggregate_needs_per_board(
        cls, db: Session, production_id: int
    ) -> Tuple[Dict[int, int], Production]:
        """Per-board component needs of a production (TOP+BOT, non-DNP, matched).

        Returns ({component_id: qty_per_board}, production). Unmatched BOM items are
        get_or_create'd into the library (ADR 0011 §2) so shortages surface.
        """
        production = db.get(Production, production_id)
        if production is None:
            raise ValueError(f"Production {production_id} introuvable")

        lookup = ComponentLibraryService.build_lookup(db.query(Component).all())
        needs: Dict[int, int] = {}
        norm = ComponentLibraryService.normalize_lookup_token

        for link in production.bom_links:
            revision = link.revision
            if revision is None:
                continue
            for item in revision.items:
                if item.dnp:
                    continue
                component = ComponentLibraryService.match_bom_item(lookup, item)
                if component is None:
                    component = StockService.get_or_create_component(
                        db,
                        value=item.value_harmonized or item.value_raw,
                        mpn=None,
                        footprint_eagle=item.footprint_eagle,
                        component_type=item.component_type,
                    )
                    # Register so identical following items match the same component.
                    for name in (component.value, item.value_raw, item.value_harmonized):
                        for fp in (component.footprint_eagle, item.footprint_pnp):
                            nk, nf = norm(name), norm(fp)
                            if nk and nf:
                                lookup.setdefault((nk, nf), component)
                needs[component.id] = needs.get(component.id, 0) + int(item.quantity or 1)

        return needs, production

    @classmethod
    def _out_qty(cls, per_board: int, boards: int, loss_pct: float) -> int:
        return math.ceil(per_board * boards * (1 + loss_pct / 100.0))

    # ------------------------------------------------------------- produce
    @classmethod
    def produce(
        cls,
        db: Session,
        production_id: int,
        machine_id: Optional[int],
        boards_produced: int,
        note: Optional[str] = None,
    ) -> ProductionRun:
        """Create a production run (batch) and post its auto OUT movements."""
        needs, _ = cls.aggregate_needs_per_board(db, production_id)
        # Coerce an unknown/0 machine to NULL (path segment may be a placeholder) to
        # avoid a bogus FK on PRODUCTION_RUNS.machine_id (rejected by SQL Server).
        from ..models.machines import PnpMachine

        valid_machine_id = (
            machine_id if (machine_id and db.get(PnpMachine, machine_id)) else None
        )
        run = ProductionRun(
            production_id=production_id,
            machine_id=valid_machine_id,
            boards_produced=max(int(boards_produced or 0), 0),
            note=note,
        )
        db.add(run)
        db.commit()
        db.refresh(run)
        cls._post_run_out(db, run, needs)
        return run

    @classmethod
    def update_run(cls, db: Session, run_id: int, boards_produced: int) -> ProductionRun:
        """Re-edit a run's real board count → reconcile its OUT (idempotent)."""
        run = db.get(ProductionRun, run_id)
        if run is None:
            raise ValueError(f"Run {run_id} introuvable")
        if run.is_cancelled:
            raise ValueError("Run annulé : ré-édition impossible")
        run.boards_produced = max(int(boards_produced or 0), 0)
        db.commit()
        needs, _ = cls.aggregate_needs_per_board(db, run.production_id)
        cls._post_run_out(db, run, needs)
        return run

    @classmethod
    def _post_run_out(cls, db: Session, run: ProductionRun, needs: Dict[int, int]) -> None:
        settings = StockService.get_settings(db)
        for component_id, per_board in needs.items():
            loss = cls._effective_loss_pct(db, component_id, settings)
            qty = cls._out_qty(per_board, run.boards_produced, loss)
            StockService.post_production_out(db, run.id, component_id, qty)

    @classmethod
    def cancel_run(cls, db: Session, run_id: int) -> ProductionRun:
        """Reversibly cancel a run (contra-post its OUT, never delete)."""
        run = db.get(ProductionRun, run_id)
        if run is None:
            raise ValueError(f"Run {run_id} introuvable")
        if not run.is_cancelled:
            run.is_cancelled = True
            db.commit()
            StockService.cancel_production_run_movements(db, run.id)
        return run

    @staticmethod
    def list_runs(db: Session, production_id: int) -> List[ProductionRun]:
        return (
            db.query(ProductionRun)
            .filter(ProductionRun.production_id == production_id)
            .order_by(ProductionRun.id.desc())
            .all()
        )

    # --------------------------------------------------- reservations / need
    @classmethod
    def _reserved_by_others(
        cls, db: Session, target_production_id: int, settings
    ) -> Dict[int, int]:
        """{component_id: reserved qty} = Σ remaining need of other non-closed prods."""
        reserved: Dict[int, int] = {}
        others = (
            db.query(Production)
            .filter(
                Production.id != target_production_id,
                Production.status.in_(_ACTIVE_STATUSES),
            )
            .all()
        )
        for production in others:
            needs, _ = cls.aggregate_needs_per_board(db, production.id)
            boards = cls.board_count(production)
            run_ids = [
                r.id
                for r in db.query(ProductionRun)
                .filter(ProductionRun.production_id == production.id)
                .all()
            ]
            for component_id, per_board in needs.items():
                loss = cls._effective_loss_pct(db, component_id, settings)
                planned = cls._out_qty(per_board, boards, loss)
                consumed = StockService.consumed_by_run_ids(db, run_ids, component_id)
                remaining = max(0, planned - consumed)
                if remaining:
                    reserved[component_id] = reserved.get(component_id, 0) + remaining
        return reserved

    @classmethod
    def can_i_produce(
        cls, db: Session, production_id: int, boards: Optional[int] = None
    ) -> Dict:
        """Need vs available (stock − reserved by others) per component + shortages."""
        needs, production = cls.aggregate_needs_per_board(db, production_id)
        settings = StockService.get_settings(db)
        board_count = int(boards) if boards is not None else cls.board_count(production)
        reserved = cls._reserved_by_others(db, production_id, settings)
        engaged = StockService.engaged_by_component(db)

        stocks = {
            s.component_id: s
            for s in db.query(ComponentStock).all()
        }
        components = {c.id: c for c in db.query(Component).all()}

        lines: List[Dict] = []
        shortage_count = 0
        for component_id, per_board in needs.items():
            loss = cls._effective_loss_pct(db, component_id, settings)
            besoin = cls._out_qty(per_board, board_count, loss)
            solde = stocks[component_id].qty_pieces if component_id in stocks else 0
            reserve = reserved.get(component_id, 0)
            engage = engaged.get(component_id, 0)
            disponible = solde - reserve - engage
            manque = max(0, besoin - disponible)
            if manque > 0:
                shortage_count += 1
            comp = components.get(component_id)
            s = stocks.get(component_id)
            lines.append(
                {
                    "component_id": component_id,
                    "reference": comp.reference if comp else None,
                    "value": comp.value if comp else None,
                    "mpn": comp.mpn if comp else None,
                    "footprint": (comp.footprint_pnp or comp.footprint_eagle) if comp else None,
                    "besoin": besoin,
                    "solde": solde,
                    "reserve": reserve,
                    "engage": engage,
                    "disponible": disponible,
                    "manque": manque,
                    "a_commander": manque,
                    "qty_reel": s.qty_reel if s else 0,
                    "qty_bag": s.qty_bag if s else 0,
                    "qty_tube": s.qty_tube if s else 0,
                }
            )
        lines.sort(key=lambda r: (-r["manque"], (r["value"] or "")))
        return {
            "production_id": production_id,
            "production_name": production.name,
            "board_count": board_count,
            "can_produce": shortage_count == 0,
            "shortage_count": shortage_count,
            "lines": lines,
        }
