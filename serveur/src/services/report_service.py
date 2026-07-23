"""Service for generating analytics and reporting data.

Provides aggregated metrics and summaries for dashboard and reporting pages.
"""

from typing import Dict, List, Optional

from sqlalchemy import func, case, or_
from sqlalchemy.orm import Session, joinedload

from ..models.bom import BomItem, BomReference, BomRevision, Component
from ..models.commands import Command, CommandItem, PlanAssignment, ProductionPlan
from ..models.machines import PnpFeeder, PnpMachine
from ..models.production import Production, ProductionBomRevision, ProductionRun
from . import presence_service
from .command_service import CommandService


class ReportService:
    """Reporting service providing aggregated insights."""

    @staticmethod
    def get_overview(db: Session) -> Dict:
        """Get dashboard overview metrics."""
        total_bom_references = db.query(func.count(BomReference.id)).scalar() or 0
        total_bom_revisions = db.query(func.count(BomRevision.id)).scalar() or 0
        total_bom_items = db.query(func.count(BomItem.id)).scalar() or 0
        total_components = db.query(func.count(Component.id)).scalar() or 0

        total_commands = db.query(func.count(Command.id)).scalar() or 0
        total_plans = db.query(func.count(ProductionPlan.id)).scalar() or 0
        total_assignments = db.query(func.count(PlanAssignment.id)).scalar() or 0
        total_machines = db.query(func.count(PnpMachine.id)).scalar() or 0
        total_feeders = db.query(func.count(PnpFeeder.id)).scalar() or 0

        # Commands by status
        status_counts = {status.value: 0 for status in Command.StatusEnum}
        status_rows = (
            db.query(Command.status, func.count(Command.id))
            .group_by(Command.status)
            .all()
        )
        for status, count in status_rows:
            status_counts[status.value] = count

        return {
            "totals": {
                "bom_references": total_bom_references,
                "bom_revisions": total_bom_revisions,
                "bom_items": total_bom_items,
                "components": total_components,
                "commands": total_commands,
                "production_plans": total_plans,
                "assignments": total_assignments,
                "machines": total_machines,
                "feeders": total_feeders,
            },
            "commands_by_status": status_counts,
        }

    @staticmethod
    def get_productions_history(db: Session, limit: int = 100) -> List[Dict]:
        """Historique des productions **terminées** (COMPLETED), datées de leur
        clôture (``updated_at``), les plus récentes d'abord. Sert le bouton
        « Historique » du dashboard."""
        prods = (
            db.query(Production)
            .filter(Production.status == Production.StatusEnum.COMPLETED)
            .order_by(Production.updated_at.desc(), Production.id.desc())
            .limit(int(limit))
            .all()
        )
        out: List[Dict] = []
        for prod in prods:
            links = prod.bom_links or []
            boards_target = sum(int(link.quantity_to_produce or 0) for link in links)
            boards_produced = (
                db.query(func.coalesce(func.sum(ProductionRun.boards_produced), 0))
                .filter(
                    ProductionRun.production_id == prod.id,
                    ProductionRun.is_cancelled == False,  # noqa: E712 (SQL Server)
                )
                .scalar()
                or 0
            )
            out.append(
                {
                    "id": prod.id,
                    "name": prod.name,
                    "date_fin": prod.updated_at.isoformat() if prod.updated_at else None,
                    "boards_produced": int(boards_produced),
                    "boards_target": boards_target,
                    "cards_tested": int(prod.cards_tested or 0),
                    "cards_validated": int(prod.cards_validated or 0),
                    "cards_to_debug": int(prod.cards_to_debug or 0),
                    "followup_note": prod.followup_note,
                }
            )
        return out

    @staticmethod
    def get_productions_summary(db: Session, include_finished: bool = False) -> List[Dict]:
        """Résumé agrégé par production pour le dashboard (une carte par production).

        Par défaut : productions **en cours** (DRAFT + ACTIVE), triées par dernière
        activité. ``include_finished=True`` ajoute COMPLETED/ARCHIVED. Par production :
        cible cartes (Σ quantity_to_produce), cartes produites (Σ runs non annulés),
        « Puis-je produire ? » (can_produce + nb de manques), dernière commande,
        machine assignée, postes présents (présence in-memory, ADR 0013).
        """
        # Import local : évite un cycle service↔service à l'import du module.
        from .production_stock_service import ProductionStockService

        query = db.query(Production)
        if not include_finished:
            query = query.filter(
                Production.status.in_(
                    [Production.StatusEnum.DRAFT, Production.StatusEnum.ACTIVE]
                )
            )
        productions = (
            query.options(
                joinedload(Production.machine),
                joinedload(Production.bom_links),
            )
            .order_by(Production.updated_at.desc())
            .all()
        )
        prod_ids = [p.id for p in productions]

        # Σ cartes produites par production en UNE requête (au lieu d'une par prod).
        produced_by_prod = dict(
            db.query(
                ProductionRun.production_id,
                func.coalesce(func.sum(ProductionRun.boards_produced), 0),
            )
            .filter(
                ProductionRun.production_id.in_(prod_ids),
                ProductionRun.is_cancelled == False,  # noqa: E712 (SQL Server: IS 0 invalide)
            )
            .group_by(ProductionRun.production_id)
            .all()
        ) if prod_ids else {}

        # Dernière commande par production en UNE requête (tri desc → première vue = dernière).
        last_command_by_prod: Dict[int, Command] = {}
        if prod_ids:
            for cmd in (
                db.query(Command)
                .filter(Command.production_id.in_(prod_ids))
                .order_by(Command.id.desc())
                .all()
            ):
                last_command_by_prod.setdefault(cmd.production_id, cmd)

        # Contexte partagé pour can_i_produce : données indépendantes de la production
        # préchargées une seule fois (sinon full-scans répétés par production).
        from .stock_service import StockService
        from .component_library_service import ComponentLibraryService
        from ..models.stock import ComponentStock

        _all_components = db.query(Component).all()
        cip_ctx = {
            "settings": StockService.get_settings(db),
            "components": {c.id: c for c in _all_components},
            "lookup": ComponentLibraryService.build_lookup(_all_components),
            "stocks": {s.component_id: s for s in db.query(ComponentStock).all()},
            "engaged": StockService.engaged_by_component(db),
        }

        summaries: List[Dict] = []
        for prod in productions:
            links = prod.bom_links or []
            boards_target = sum(int(link.quantity_to_produce or 0) for link in links)

            boards_produced = int(produced_by_prod.get(prod.id, 0) or 0)

            # « Puis-je produire ? » — résumé seulement (pas les lignes détaillées).
            stock = None
            try:
                res = ProductionStockService.can_i_produce(db, prod.id, None, ctx=cip_ctx)
                getter = res.get if isinstance(res, dict) else lambda k, d=None: getattr(res, k, d)
                stock = {
                    "can_produce": bool(getter("can_produce", False)),
                    "shortage_count": int(getter("shortage_count", 0) or 0),
                    "board_count": int(getter("board_count", 0) or 0),
                }
            except ValueError:
                stock = None  # production sans révision liée, etc.

            last_command = last_command_by_prod.get(prod.id)

            summaries.append(
                {
                    "id": prod.id,
                    "name": prod.name,
                    "assembly_mode": prod.assembly_mode or "PNP",
                    "status": prod.status.value if prod.status else None,
                    "created_at": prod.created_at.isoformat() if prod.created_at else None,
                    "updated_at": prod.updated_at.isoformat() if prod.updated_at else None,
                    "machine": (
                        {"id": prod.machine.id, "name": prod.machine.name}
                        if prod.machine is not None
                        else None
                    ),
                    "revisions_count": len(links),
                    "boards_target": boards_target,
                    "boards_produced": int(boards_produced),
                    "stock": stock,
                    "command": (
                        {
                            "id": last_command.id,
                            "status": last_command.status.value
                            if last_command.status
                            else None,
                        }
                        if last_command is not None
                        else None
                    ),
                    "presence_count": presence_service.count_for(prod.id)["count"],
                }
            )
        return summaries

    @staticmethod
    def get_bom_stats(db: Session, production_id: Optional[int] = None) -> Dict:
        """Get BOM review stats, optionally scoped to a production's linked revisions.

        Returns counts used by the Dashboard KPI cards:
        - total_items: total BOM lines in scope
        - items_with_footprint_pnp: lines with a PnP footprint mapped
        - items_to_verify: non-DNP lines missing footprint_pnp OR component_type
        """
        base_q = db.query(BomItem)

        if production_id is not None:
            # Filter to revision IDs linked to this production
            linked_revision_ids = (
                db.query(ProductionBomRevision.bom_revision_id)
                .filter(ProductionBomRevision.production_id == production_id)
                .subquery()
            )
            base_q = base_q.filter(BomItem.bom_revision_id.in_(linked_revision_ids))

        total_items = base_q.count()
        items_with_footprint_pnp = base_q.filter(
            BomItem.footprint_pnp.isnot(None),
            BomItem.footprint_pnp != "",
        ).count()
        # dnp column is NOT NULL (default=False, server_default="0"), but legacy data
        # may still contain dnp=NULL rows. Use a NULL-safe (dnp == False OR dnp IS NULL)
        # filter instead of isnot(True): SQL Server rejects `IS NOT 1` (T-SQL only allows
        # IS [NOT] NULL), and we must still include NULL rows (= not placed, not explicitly
        # DNP) to avoid the silent under-count in items_to_verify.
        items_to_verify = base_q.filter(
            or_(BomItem.dnp == False, BomItem.dnp.is_(None)),  # noqa: E712
        ).filter(
            (BomItem.footprint_pnp.is_(None)) | (BomItem.footprint_pnp == "")
            | (BomItem.component_type.is_(None)) | (BomItem.component_type == "")
        ).count()

        return {
            "production_id": production_id,
            "total_items": total_items,
            "items_with_footprint_pnp": items_with_footprint_pnp,
            "items_to_verify": items_to_verify,
        }

    @staticmethod
    def get_command_report(db: Session, command_id: int) -> Dict:
        """Get a detailed report for a single command."""
        # Reuse existing command summary logic
        return CommandService.get_command_summary(db=db, command_id=command_id)

    @staticmethod
    def list_machine_utilization(db: Session) -> List[Dict]:
        """Get utilization metrics for each machine.

        Uses 3 queries total instead of 2 queries-per-machine (was N+1).
        """
        machines = db.query(PnpMachine).all()
        if not machines:
            return []

        machine_ids = [m.id for m in machines]

        # Plans per machine — one aggregated query
        plan_rows = (
            db.query(ProductionPlan.machine_id, func.count(ProductionPlan.id).label("cnt"))
            .filter(ProductionPlan.machine_id.in_(machine_ids))
            .group_by(ProductionPlan.machine_id)
            .all()
        )
        plans_by_machine = {row.machine_id: row.cnt for row in plan_rows}

        # Assignments per machine via JOIN — one aggregated query
        assignment_rows = (
            db.query(ProductionPlan.machine_id, func.count(PlanAssignment.id).label("cnt"))
            .join(PlanAssignment, PlanAssignment.production_plan_id == ProductionPlan.id)
            .filter(ProductionPlan.machine_id.in_(machine_ids))
            .group_by(ProductionPlan.machine_id)
            .all()
        )
        assignments_by_machine = {row.machine_id: row.cnt for row in assignment_rows}

        return [
            {
                "machine_id": machine.id,
                "machine_name": machine.name,
                "plans": plans_by_machine.get(machine.id, 0),
                "assignments": assignments_by_machine.get(machine.id, 0),
            }
            for machine in machines
        ]

    @staticmethod
    def list_top_components(db: Session, limit: int = 10) -> List[Dict]:
        """Get the top used components across all commands."""
        value_expr = func.coalesce(BomItem.value_harmonized, BomItem.value_raw, "Valeur non renseignee")
        footprint_expr = func.coalesce(BomItem.footprint_pnp, BomItem.footprint_eagle, "Empreinte non renseignee")
        component_type_expr = func.coalesce(BomItem.component_type, "Autre")
        total_required_expr = func.sum(CommandItem.quantity_to_produce * func.coalesce(BomItem.quantity, 1))

        rows = (
            db.query(
                value_expr.label("value"),
                footprint_expr.label("footprint"),
                component_type_expr.label("component_type"),
                total_required_expr.label("total_required"),
            )
            .join(CommandItem, CommandItem.bom_revision_id == BomItem.bom_revision_id)
            .filter(BomItem.dnp == False)  # noqa: E712 (SQL Server: IS 0 invalide)
            .group_by(value_expr, footprint_expr, component_type_expr)
            .order_by(total_required_expr.desc())
            .limit(limit)
            .all()
        )
        return [
            {
                "value": row.value,
                "footprint": row.footprint,
                "component_type": row.component_type,
                "total_required": row.total_required or 0,
            }
            for row in rows
        ]
