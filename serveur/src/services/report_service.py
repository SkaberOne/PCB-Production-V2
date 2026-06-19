"""Service for generating analytics and reporting data.

Provides aggregated metrics and summaries for dashboard and reporting pages.
"""

from typing import Dict, List, Optional

from sqlalchemy import func, case, or_
from sqlalchemy.orm import Session

from ..models.bom import BomItem, BomReference, BomRevision, Component
from ..models.commands import Command, CommandItem, PlanAssignment, ProductionPlan
from ..models.machines import PnpFeeder, PnpMachine
from ..models.production import Production, ProductionBomRevision
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
