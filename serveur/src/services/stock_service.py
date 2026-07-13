"""Business logic for the internal physical component stock (ADR 0010, Phase 1).

The ``StockMovement`` journal is the source of truth; ``ComponentStock`` is a
recomputable cache. All balance changes go through this service so that:

* idempotence is guaranteed (filtered unique ``(source_type, source_id)`` +
  set-to semantics for manual recounts);
* movements are reversible by inverse rows, never deleted;
* no double counting between auto receptions and manual declarations.

No ``user`` field anywhere (single-user app). Timestamps come from ``utcnow()``.
Boolean filters use ``== False  # noqa: E712`` (never the SQL-Server-invalid
``IS 0`` form) — the only form valid on SQL Server (cf. audit T-001/T-002).
"""

from __future__ import annotations

import logging
import uuid
from typing import Dict, List, Optional

from sqlalchemy import case, func
from sqlalchemy.orm import Session

from ..database import utcnow
from ..models.bom import Component
from ..models.stock import (
    ComponentMachineLoad,
    ComponentStock,
    StockMotif,
    StockMovement,
    StockSens,
    StockSettings,
)
from .component_library_service import ComponentLibraryService

logger = logging.getLogger(__name__)

_UNSET = object()  # sentinel to distinguish "not provided" from "set to null"


class StockService:
    """Physical stock: balance, journal, declarations, corrections, receptions."""

    # ------------------------------------------------------------- settings
    @staticmethod
    def get_settings(db: Session) -> StockSettings:
        row = db.query(StockSettings).order_by(StockSettings.id).first()
        if row is None:
            row = StockSettings(global_loss_pct=0.0)
            db.add(row)
            db.commit()
            db.refresh(row)
        return row

    @classmethod
    def set_global_loss_pct(cls, db: Session, value: float) -> StockSettings:
        row = cls.get_settings(db)
        row.global_loss_pct = max(float(value or 0.0), 0.0)
        db.commit()
        db.refresh(row)
        return row

    # -------------------------------------------------------- component row
    @staticmethod
    def get_or_create_stock(db: Session, component_id: int) -> ComponentStock:
        row = (
            db.query(ComponentStock)
            .filter(ComponentStock.component_id == component_id)
            .first()
        )
        if row is None:
            row = ComponentStock(component_id=component_id)
            db.add(row)
            db.commit()
            db.refresh(row)
        return row

    @classmethod
    def set_verified(cls, db: Session, component_id: int, verified: bool) -> ComponentStock:
        """Marque (ou dé-marque) la quantité stock comme vérifiée physiquement.

        Version A (ADR 0013) : n'affecte PAS le solde. ``verified_qty`` mémorise le
        solde confirmé au moment de la validation.
        """
        row = cls.get_or_create_stock(db, component_id)
        if verified:
            row.verified_at = utcnow().replace(tzinfo=None)
            row.verified_qty = row.qty_pieces
        else:
            row.verified_at = None
            row.verified_qty = None
        db.commit()
        db.refresh(row)
        return row

    @classmethod
    def verify_batch(cls, db: Session, component_ids: List[int]) -> int:
        """Marque plusieurs composants comme vérifiés d'un coup. Retourne le nombre traité."""
        now = utcnow().replace(tzinfo=None)
        count = 0
        for cid in component_ids:
            row = cls.get_or_create_stock(db, cid)
            row.verified_at = now
            row.verified_qty = row.qty_pieces
            count += 1
        db.commit()
        return count

    @classmethod
    def set_component_params(
        cls,
        db: Session,
        component_id: int,
        safety_stock: Optional[int] = None,
        loss_pct=_UNSET,
    ) -> ComponentStock:
        row = cls.get_or_create_stock(db, component_id)
        if safety_stock is not None:
            row.safety_stock = int(safety_stock)
        if loss_pct is not _UNSET:
            row.loss_pct = None if loss_pct is None else max(float(loss_pct), 0.0)
        db.commit()
        db.refresh(row)
        return row

    # -------------------------------------------------------------- balance
    @classmethod
    def recompute_solde(cls, db: Session, component_id: int) -> int:
        """Recompute the cached balance = Σ signed(qty) over the whole journal."""
        signed = case(
            (StockMovement.sens == StockSens.IN, StockMovement.qty),
            else_=-StockMovement.qty,
        )
        total = (
            db.query(func.coalesce(func.sum(signed), 0))
            .filter(StockMovement.component_id == component_id)
            .scalar()
        )
        total = int(total or 0)
        row = cls.get_or_create_stock(db, component_id)
        row.qty_pieces = total
        db.commit()
        return total

    # ----------------------------------------------------- internal helpers
    @staticmethod
    def _active_movement(
        db: Session, source_type: str, source_id: str
    ) -> Optional[StockMovement]:
        return (
            db.query(StockMovement)
            .filter(
                StockMovement.source_type == source_type,
                StockMovement.source_id == source_id,
                StockMovement.is_reversed == False,  # noqa: E712 (SQL Server: IS 0 invalide)
            )
            .first()
        )

    @staticmethod
    def _insert(
        db: Session,
        component_id: int,
        sens: StockSens,
        qty: int,
        motif: StockMotif,
        source_type: str,
        source_id: Optional[str],
        conditionnement=None,
        note: Optional[str] = None,
        production_run_id: Optional[int] = None,
        is_reversed: bool = False,
        reverses_id: Optional[int] = None,
    ) -> StockMovement:
        movement = StockMovement(
            component_id=component_id,
            sens=sens,
            qty=int(qty),
            motif=motif,
            conditionnement=conditionnement,
            source_type=source_type,
            source_id=source_id,
            note=note,
            production_run_id=production_run_id,
            is_reversed=is_reversed,
            reverses_id=reverses_id,
        )
        db.add(movement)
        db.flush()
        return movement

    @classmethod
    def _supersede(cls, db: Session, movement: StockMovement) -> None:
        """Mark an active movement as reversed + append its inverse (audit)."""
        inverse = StockSens.OUT if movement.sens == StockSens.IN else StockSens.IN
        cls._insert(
            db,
            component_id=movement.component_id,
            sens=inverse,
            qty=movement.qty,
            motif=movement.motif,
            source_type="reversal",
            source_id=f"rev:{movement.id}",
            conditionnement=movement.conditionnement,
            note=f"Annulation du mouvement #{movement.id}",
            production_run_id=movement.production_run_id,
            is_reversed=True,  # audit row: never occupies the active namespace
            reverses_id=movement.id,
        )
        movement.is_reversed = True

    @staticmethod
    def _sens_for_delta(delta: int):
        return (StockSens.IN, delta) if delta >= 0 else (StockSens.OUT, -delta)

    # --------------------------------------------------------- declarations
    @classmethod
    def post_declaration(
        cls,
        db: Session,
        component_id: int,
        qty_reel: int = 0,
        qty_bag: int = 0,
        qty_tube: int = 0,
        note: Optional[str] = None,
    ) -> ComponentStock:
        """Absolute physical recount from BomStockDialog (set-to).

        The declared total (reel+bag+tube) = physical truth: we post the delta to
        reach it. Delta 0 => no movement (idempotent). Never double-counts with
        prior receptions. Also snapshots the reel/bag/tube breakdown.
        """
        r, b, t = int(qty_reel or 0), int(qty_bag or 0), int(qty_tube or 0)
        target_total = r + b + t
        current = cls.recompute_solde(db, component_id)
        delta = target_total - current
        if delta != 0:
            sens, mag = cls._sens_for_delta(delta)
            cls._insert(
                db,
                component_id=component_id,
                sens=sens,
                qty=mag,
                motif=StockMotif.declaration,
                source_type="declaration",
                source_id=uuid.uuid4().hex,
                note=note or "Recomptage physique (déclaration)",
            )
            db.commit()
        stock = cls.get_or_create_stock(db, component_id)
        stock.qty_reel, stock.qty_bag, stock.qty_tube = r, b, t
        db.commit()
        cls.recompute_solde(db, component_id)
        return cls.get_or_create_stock(db, component_id)

    # ---------------------------------------------------------- corrections
    @classmethod
    def post_correction(
        cls,
        db: Session,
        component_id: int,
        new_total: int,
        note: Optional[str] = None,
    ) -> ComponentStock:
        """Periodic inventory recount (set-to). Absorbs the SAV/repair drain."""
        current = cls.recompute_solde(db, component_id)
        delta = int(new_total) - current
        if delta != 0:
            sens, mag = cls._sens_for_delta(delta)
            cls._insert(
                db,
                component_id=component_id,
                sens=sens,
                qty=mag,
                motif=StockMotif.correction,
                source_type="correction",
                source_id=uuid.uuid4().hex,
                note=note or "Correction d'inventaire",
            )
            db.commit()
        cls.recompute_solde(db, component_id)
        return cls.get_or_create_stock(db, component_id)

    # ------------------------------------------------------------ reception
    @classmethod
    def post_reception(
        cls, db: Session, receipt_id: int, component_id: int, qty: int
    ) -> None:
        """Reconcile the auto IN for one CommandReceipt to its current qty_received.

        Idempotent per receipt (filtered unique ``reception``/``receipt_id``):
        re-editing the receipt supersedes the previous active IN and re-posts.
        """
        source_type = "reception"
        source_id = str(receipt_id)
        target = max(int(qty or 0), 0)
        active = cls._active_movement(db, source_type, source_id)
        if active is not None:
            if (
                active.sens == StockSens.IN
                and active.qty == target
                and active.component_id == component_id
            ):
                return  # unchanged => idempotent no-op
            cls._supersede(db, active)
        if target > 0:
            cls._insert(
                db,
                component_id=component_id,
                sens=StockSens.IN,
                qty=target,
                motif=StockMotif.reception,
                source_type=source_type,
                source_id=source_id,
                note="Réception commande (auto)",
            )
        db.commit()
        cls.recompute_solde(db, component_id)

    # ----------------------------------------------- manual reception (add)
    @classmethod
    def post_manual_reception(
        cls,
        db: Session,
        component_id: int,
        qty: int,
        note: Optional[str] = None,
    ) -> ComponentStock:
        """Manual reception from the Stock › Réception tab: additive IN movement.

        Unlike ``post_reception`` (idempotent per CommandReceipt), each call here
        appends a fresh IN (unique uuid source_id) so the received quantity is
        *added* to the current balance. Reversible like any other movement.
        """
        q = int(qty or 0)
        if q > 0:
            cls._insert(
                db,
                component_id=component_id,
                sens=StockSens.IN,
                qty=q,
                motif=StockMotif.reception,
                source_type="reception_manuelle",
                source_id=uuid.uuid4().hex,
                note=note or "Réception manuelle (onglet Stock)",
            )
            db.commit()
        cls.recompute_solde(db, component_id)
        return cls.get_or_create_stock(db, component_id)

    # ------------------------------------------------------ reversible undo
    @classmethod
    def cancel_movement(cls, db: Session, movement_id: int) -> StockMovement:
        """Reversibly cancel a movement (append an inverse; never delete)."""
        movement = db.get(StockMovement, movement_id)
        if movement is None:
            raise ValueError(f"Mouvement {movement_id} introuvable")
        if movement.source_type == "reversal":
            raise ValueError("Un mouvement d'annulation ne peut pas être annulé")
        if movement.is_reversed:
            return movement  # already cancelled/superseded — idempotent
        cls._supersede(db, movement)
        db.commit()
        cls.recompute_solde(db, movement.component_id)
        return movement

    # ----------------------------------------------------- production (OUT)
    @classmethod
    def post_production_out(
        cls, db: Session, run_id: int, component_id: int, qty: int
    ) -> None:
        """Reconcile the auto OUT for one (production run, component) to ``qty``.

        Idempotent per (run, component) via the filtered unique index; re-editing
        the run's board count supersedes the previous OUT and re-posts (ADR 0011 §3).
        """
        source_type = "production"
        source_id = f"{run_id}:{component_id}"
        target = max(int(qty or 0), 0)
        active = cls._active_movement(db, source_type, source_id)
        if active is not None:
            if (
                active.sens == StockSens.OUT
                and active.qty == target
                and active.component_id == component_id
            ):
                return
            cls._supersede(db, active)
        if target > 0:
            cls._insert(
                db,
                component_id=component_id,
                sens=StockSens.OUT,
                qty=target,
                motif=StockMotif.production,
                source_type=source_type,
                source_id=source_id,
                production_run_id=run_id,
                note="Consommation production (auto)",
            )
        db.commit()
        cls.recompute_solde(db, component_id)

    @classmethod
    def cancel_production_run_movements(cls, db: Session, run_id: int) -> None:
        """Reverse every active OUT of a production run (append inverses; no delete)."""
        actives = (
            db.query(StockMovement)
            .filter(
                StockMovement.production_run_id == run_id,
                StockMovement.source_type == "production",
                StockMovement.is_reversed == False,  # noqa: E712 (SQL Server: IS 0 invalide)
            )
            .all()
        )
        components = set()
        for movement in actives:
            cls._supersede(db, movement)
            components.add(movement.component_id)
        db.commit()
        for component_id in components:
            cls.recompute_solde(db, component_id)

    @staticmethod
    def consumed_by_run_ids(db: Session, run_ids, component_id: int) -> int:
        """Σ active production OUT magnitude for the given runs and component."""
        if not run_ids:
            return 0
        total = (
            db.query(func.coalesce(func.sum(StockMovement.qty), 0))
            .filter(
                StockMovement.production_run_id.in_(list(run_ids)),
                StockMovement.source_type == "production",
                StockMovement.sens == StockSens.OUT,
                StockMovement.is_reversed == False,  # noqa: E712 (SQL Server: IS 0 invalide)
                StockMovement.component_id == component_id,
            )
            .scalar()
        )
        return int(total or 0)

    # --------------------------------------------- component get_or_create
    @classmethod
    def get_or_create_component(
        cls,
        db: Session,
        value: Optional[str],
        mpn: Optional[str],
        footprint_eagle: Optional[str],
        component_type: Optional[str] = None,
    ) -> Component:
        reference = ComponentLibraryService.build_component_reference(
            value, mpn, footprint_eagle
        )
        component = (
            db.query(Component).filter(Component.reference == reference).first()
        )
        if component is None:
            component = Component(
                reference=reference,
                value=value,
                mpn=mpn,
                footprint_eagle=ComponentLibraryService.normalize_footprint(footprint_eagle),
                component_type=component_type,
            )
            db.add(component)
            db.commit()
            db.refresh(component)
        return component

    # ---------------------------------------------------------------- reads
    @staticmethod
    def _status(qty: int, safety: int) -> str:
        if qty < 0:
            return "manque"
        if safety > 0 and qty <= safety:
            return "bas"
        return "ok"

    @classmethod
    def list_stock(cls, db: Session) -> List[Dict]:
        """Library components + balance + breakdown + status."""
        settings = cls.get_settings(db)
        stocks = {s.component_id: s for s in db.query(ComponentStock).all()}
        engaged = cls.engaged_by_component(db)
        rows: List[Dict] = []
        for component in db.query(Component).all():
            s = stocks.get(component.id)
            qty = s.qty_pieces if s else 0
            safety = s.safety_stock if s else 0
            loss = s.loss_pct if s else None
            eng = engaged.get(component.id, 0)
            rows.append(
                {
                    "component_id": component.id,
                    "reference": component.reference,
                    "value": component.value,
                    "mpn": component.mpn,
                    "component_type": component.component_type,
                    "footprint_eagle": component.footprint_eagle,
                    "footprint_pnp": component.footprint_pnp,
                    "qty_pieces": qty,
                    "qty_reel": s.qty_reel if s else 0,
                    "qty_bag": s.qty_bag if s else 0,
                    "qty_tube": s.qty_tube if s else 0,
                    "engaged": eng,
                    "libre": qty - eng,
                    "safety_stock": safety,
                    "loss_pct": loss,
                    "effective_loss_pct": loss if loss is not None else settings.global_loss_pct,
                    "has_stock_row": s is not None,
                    "status": cls._status(qty, safety),
                    "lifecycle_status": component.lifecycle_status,
                    "lifecycle_checked_at": component.lifecycle_checked_at.isoformat() if component.lifecycle_checked_at else None,
                    "verified_at": s.verified_at.isoformat() if s and s.verified_at else None,
                    "verified_qty": s.verified_qty if s else None,
                }
            )
        rows.sort(key=lambda r: ((r["value"] or "").upper(), (r["footprint_pnp"] or "")))
        return rows

    @staticmethod
    def get_journal(db: Session, component_id: int) -> List[StockMovement]:
        return (
            db.query(StockMovement)
            .filter(StockMovement.component_id == component_id)
            .order_by(StockMovement.date.desc(), StockMovement.id.desc())
            .all()
        )

    # ------------------------------------------ engaged on feeders (Phase 3)
    @staticmethod
    def engaged_by_component(db: Session) -> Dict[int, int]:
        """{component_id: Σ qty loaded on all machines} (ADR 0012)."""
        rows = (
            db.query(
                ComponentMachineLoad.component_id,
                func.coalesce(func.sum(ComponentMachineLoad.qty_loaded), 0),
            )
            .group_by(ComponentMachineLoad.component_id)
            .all()
        )
        return {cid: int(total or 0) for cid, total in rows}

    @staticmethod
    def set_machine_load(
        db: Session,
        machine_id: int,
        component_id: int,
        qty_loaded: int,
        note: Optional[str] = None,
    ) -> Optional[ComponentMachineLoad]:
        """Set-to the loaded quantity for (machine, component). 0 ⇒ unloaded (row removed)."""
        row = (
            db.query(ComponentMachineLoad)
            .filter(
                ComponentMachineLoad.machine_id == machine_id,
                ComponentMachineLoad.component_id == component_id,
            )
            .first()
        )
        qty = max(int(qty_loaded or 0), 0)
        if qty <= 0:
            if row is not None:
                db.delete(row)
                db.commit()
            return None
        if row is None:
            row = ComponentMachineLoad(
                machine_id=machine_id, component_id=component_id, qty_loaded=qty, note=note
            )
            db.add(row)
        else:
            row.qty_loaded = qty
            if note is not None:
                row.note = note
        db.commit()
        db.refresh(row)
        return row

    @staticmethod
    def list_machine_loads(db: Session, machine_id: int) -> List[Dict]:
        """Components currently loaded on a machine (with component info)."""
        rows = (
            db.query(ComponentMachineLoad)
            .filter(ComponentMachineLoad.machine_id == machine_id)
            .all()
        )
        comps = {c.id: c for c in db.query(Component).all()}
        out: List[Dict] = []
        for r in rows:
            c = comps.get(r.component_id)
            out.append(
                {
                    "machine_id": r.machine_id,
                    "component_id": r.component_id,
                    "value": c.value if c else None,
                    "mpn": c.mpn if c else None,
                    "footprint": (c.footprint_pnp or c.footprint_eagle) if c else None,
                    "qty_loaded": r.qty_loaded,
                    "note": r.note,
                }
            )
        out.sort(key=lambda x: (x["value"] or ""))
        return out
