"""
Service for managing production plans
Handles creation and management of production plans from commands
"""

from sqlalchemy.orm import Session
from sqlalchemy import and_, desc, or_
from datetime import datetime
from typing import List, Dict, Optional, Tuple
import logging

from ..models.bom import BomItem, BomRevision, Component
from ..models.commands import Command, CommandItem, PlanAssignment, ProductionPlan
from ..models.machines import PnpFeeder, PnpMachine
from .command_service import CommandService
from .component_library_service import ComponentLibraryService
from ..utils.feeder_types import normalize_component_feeder_type

logger = logging.getLogger(__name__)


class ProductionService:
    """Service for managing production plans and workflow orchestration"""

    @staticmethod
    def _match_component_for_bom_item(
        component_lookup: Dict[Tuple[str, str], Component],
        bom_item: BomItem,
    ) -> Optional[Component]:
        return ComponentLibraryService.match_bom_item(component_lookup, bom_item)
    
    @staticmethod
    def create_production_plan(
        db: Session,
        command_id: int,
        machine_id: int,
        notes: Optional[str] = None
    ) -> ProductionPlan:
        """
        Create a production plan for a command on a specific machine
        
        Args:
            db: Database session
            command_id: ID of command to plan
            machine_id: ID of PnP machine
            notes: Optional notes about the plan
            
        Returns:
            Created ProductionPlan object
            
        Raises:
            ValueError: If command or machine not found
        """
        # Validate command exists
        command = db.query(Command).filter(Command.id == command_id).first()
        if not command:
            raise ValueError(f"Command {command_id} not found")
        
        # Validate machine exists
        machine = db.query(PnpMachine).filter(PnpMachine.id == machine_id).first()
        if not machine:
            raise ValueError(f"Machine {machine_id} not found")
        
        # Check if plan already exists for this command on this machine
        existing_plan = db.query(ProductionPlan).filter(
            and_(
                ProductionPlan.command_id == command_id,
                ProductionPlan.machine_id == machine_id
            )
        ).first()
        
        if existing_plan:
            logger.warning("Plan already exists for command %s on machine %s", command_id, machine_id)
            return existing_plan
        
        # Create production plan
        plan = ProductionPlan(
            command_id=command_id,
            machine_id=machine_id,
            notes=notes.strip() if notes else None
        )
        
        db.add(plan)
        db.commit()
        db.refresh(plan)
        
        logger.info("Created production plan %s for command %s on machine %s", plan.id, command_id, machine_id)
        return plan
    
    @staticmethod
    def auto_assign_components(
        db: Session,
        plan_id: int,
        strategy: str = "by_type"
    ) -> Tuple[int, List[Dict]]:
        """
        Automatically assign components from command to machine feeders
        using specified strategy
        
        Args:
            db: Database session
            plan_id: ID of production plan
            strategy: Assignment strategy ('by_type', 'by_quantity', 'by_value')
            
        Returns:
            Tuple of (total assignments made, list of assignment details)
            
        Raises:
            ValueError: If plan not found or insufficient feeder capacity
        """
        plan = db.query(ProductionPlan).filter(ProductionPlan.id == plan_id).first()
        if not plan:
            raise ValueError(f"Production plan {plan_id} not found")

        machine = db.query(PnpMachine).filter(PnpMachine.id == plan.machine_id).first()
        if not machine:
            raise ValueError(f"Machine {plan.machine_id} not found")

        command_items = db.query(CommandItem).filter(CommandItem.command_id == plan.command_id).all()
        component_lookup = ComponentLibraryService.build_lookup(db.query(Component).all())

        # Build revision_id → quantity_to_produce map once; avoid N+1 BomItem queries.
        qty_by_revision: Dict[int, int] = {ci.bom_revision_id: ci.quantity_to_produce for ci in command_items}
        revision_ids = list(qty_by_revision.keys())

        # Single query for all BomItems across all revisions (replaces per-revision loop).
        all_bom_items = (
            db.query(BomItem)
            .filter(
                BomItem.bom_revision_id.in_(revision_ids),
                or_(BomItem.dnp == False, BomItem.dnp.is_(None)),  # noqa: E712 (SQL Server: IS NOT 1 invalide; inclut les lignes dnp NULL legacy)
            )
            .all()
        ) if revision_ids else []

        components_map: Dict[int, Dict] = {}
        unresolved_components: List[str] = []

        for bom_item in all_bom_items:
            qty_to_produce = qty_by_revision.get(bom_item.bom_revision_id, 1)
            matched_component = ProductionService._match_component_for_bom_item(component_lookup, bom_item)
            if not matched_component:
                unresolved_components.append(
                    f"{bom_item.reference_item} ({bom_item.value_harmonized or bom_item.value_raw or 'Unknown'} / "
                    f"{bom_item.footprint_pnp or bom_item.footprint_eagle or 'Unknown'})"
                )
                continue

            component_entry = components_map.setdefault(
                matched_component.id,
                {
                    "component_id": matched_component.id,
                    "component_name": matched_component.mpn or matched_component.value or matched_component.reference,
                    "component_reference": matched_component.reference,
                    "component_value": matched_component.value or bom_item.value_harmonized or bom_item.value_raw,
                    "component_type": bom_item.component_type or "Autre",
                    "footprint": matched_component.footprint_pnp or matched_component.package or matched_component.footprint_eagle,
                    "feeder_type": normalize_component_feeder_type(matched_component.feeder_type),
                    "total_quantity": 0,
                },
            )
            component_entry["total_quantity"] += (bom_item.quantity or 1) * qty_to_produce

        if unresolved_components:
            raise ValueError(
                "Cannot auto-assign components without a component-library match: "
                + "; ".join(sorted(set(unresolved_components))[:10])
            )

        if strategy == "by_quantity":
            sorted_components = sorted(
                components_map.values(),
                key=lambda item: item["total_quantity"],
                reverse=True,
            )
        elif strategy == "by_value":
            sorted_components = sorted(
                components_map.values(),
                key=lambda item: (item["component_value"] or "", item["component_reference"]),
            )
        else:
            sorted_components = sorted(
                components_map.values(),
                key=lambda item: (item["component_type"] or "", item["component_value"] or "", item["component_reference"]),
            )

        existing_assignments = db.query(PlanAssignment).filter(
            PlanAssignment.production_plan_id == plan_id
        ).all()

        used_positions = {assignment.feeder_position for assignment in existing_assignments}
        available_positions = [position for position in range(1, machine.num_positions + 1) if position not in used_positions]

        if len(available_positions) < len(sorted_components):
            overflow = sorted_components[len(available_positions):]
            refs = ", ".join(
                str(c.get("component_reference") or c.get("component_id"))
                for c in overflow
            )
            raise ValueError(
                f"Capacite machine insuffisante : {len(sorted_components)} composant(s) "
                f"pour {len(available_positions)} position(s) libre(s). "
                f"Composant(s) non assignable(s) : {refs}"
            )

        assignment_details = []

        for feeder_position, component_info in zip(available_positions, sorted_components):
            assignment = PlanAssignment(
                production_plan_id=plan_id,
                feeder_position=feeder_position,
                component_id=component_info["component_id"],
                quantity=component_info["total_quantity"],
            )
            db.add(assignment)

            assignment_details.append(
                {
                    "feeder_position": feeder_position,
                    "component_id": component_info["component_id"],
                    "component": component_info["component_name"],
                    "component_reference": component_info["component_reference"],
                    "component_value": component_info["component_value"],
                    "component_type": component_info["component_type"],
                    "quantity": component_info["total_quantity"],
                    "footprint": component_info["footprint"],
                    "feeder_type": component_info["feeder_type"],
                }
            )

        db.commit()

        logger.info(
            "Auto-assigned %s components to plan %s using '%s' strategy",
            len(assignment_details),
            plan_id,
            strategy,
        )
        return len(assignment_details), assignment_details
    
    @staticmethod
    def manual_assign_component(
        db: Session,
        plan_id: int,
        feeder_position: int,
        component_id: int,
        quantity: int
    ) -> PlanAssignment:
        """
        Manually assign a component to a specific feeder position
        
        Args:
            db: Database session
            plan_id: ID of production plan
            feeder_position: Feeder position (1-60)
            component_id: ID of component
            quantity: Quantity required
            
        Returns:
            Created PlanAssignment
            
        Raises:
            ValueError: If validation fails
        """
        # Validate plan
        plan = db.query(ProductionPlan).filter(ProductionPlan.id == plan_id).first()
        if not plan:
            raise ValueError(f"Production plan {plan_id} not found")
        
        # Validate component
        component = db.query(Component).filter(Component.id == component_id).first()
        if not component:
            raise ValueError(f"Component {component_id} not found")
        
        machine = db.query(PnpMachine).filter(PnpMachine.id == plan.machine_id).first()
        if not machine:
            raise ValueError(f"Machine {plan.machine_id} not found")

        if feeder_position < 1 or feeder_position > machine.num_positions:
            raise ValueError(
                f"Invalid feeder position: {feeder_position}. Must be 1-{machine.num_positions}"
            )
        
        # Check if position is already assigned
        existing = db.query(PlanAssignment).filter(
            and_(
                PlanAssignment.production_plan_id == plan_id,
                PlanAssignment.feeder_position == feeder_position
            )
        ).first()
        
        if existing:
            raise ValueError(f"Feeder position {feeder_position} is already assigned in this plan")
        
        # Validate quantity
        if quantity < 1:
            raise ValueError(f"Quantity must be at least 1, got {quantity}")
        
        # Create assignment
        assignment = PlanAssignment(
            production_plan_id=plan_id,
            feeder_position=feeder_position,
            component_id=component_id,
            quantity=quantity
        )
        
        db.add(assignment)
        db.commit()
        db.refresh(assignment)
        
        logger.info("Manually assigned component %s to feeder %s in plan %s", component_id, feeder_position, plan_id)
        return assignment
    
    @staticmethod
    def update_assignment(
        db: Session,
        assignment_id: int,
        new_quantity: Optional[int] = None,
        new_position: Optional[int] = None
    ) -> PlanAssignment:
        """
        Update an existing plan assignment
        
        Args:
            db: Database session
            assignment_id: ID of plan assignment
            new_quantity: New quantity (optional)
            new_position: New feeder position (optional)
            
        Returns:
            Updated PlanAssignment
            
        Raises:
            ValueError: If assignment not found or validation fails
        """
        assignment = db.query(PlanAssignment).filter(
            PlanAssignment.id == assignment_id
        ).first()
        
        if not assignment:
            raise ValueError(f"Assignment {assignment_id} not found")
        
        if new_quantity is not None:
            if new_quantity < 1:
                raise ValueError(f"Quantity must be at least 1, got {new_quantity}")
            assignment.quantity = new_quantity
        
        if new_position is not None:
            plan = db.query(ProductionPlan).filter(
                ProductionPlan.id == assignment.production_plan_id
            ).first()
            machine = db.query(PnpMachine).filter(
                PnpMachine.id == plan.machine_id
            ).first() if plan else None

            if not machine:
                raise ValueError("Associated machine not found for this assignment")

            if new_position < 1 or new_position > machine.num_positions:
                raise ValueError(
                    f"Invalid feeder position: {new_position}. Must be 1-{machine.num_positions}"
                )
            
            # Check if new position is available
            existing = db.query(PlanAssignment).filter(
                and_(
                    PlanAssignment.production_plan_id == assignment.production_plan_id,
                    PlanAssignment.feeder_position == new_position,
                    PlanAssignment.id != assignment_id
                )
            ).first()
            
            if existing:
                raise ValueError(f"Feeder position {new_position} is already in use")
            
            assignment.feeder_position = new_position
        
        db.commit()
        db.refresh(assignment)
        
        logger.info("Updated assignment %s", assignment_id)
        return assignment
    
    @staticmethod
    def remove_assignment(db: Session, assignment_id: int) -> bool:
        """
        Remove a component assignment from a plan
        
        Args:
            db: Database session
            assignment_id: ID of plan assignment
            
        Returns:
            True if removed, False if not found
        """
        assignment = db.query(PlanAssignment).filter(
            PlanAssignment.id == assignment_id
        ).first()
        
        if not assignment:
            return False
        
        db.delete(assignment)
        db.commit()
        
        logger.info("Removed assignment %s", assignment_id)
        return True
    
    @staticmethod
    def get_plan_by_id(db: Session, plan_id: int) -> Optional[ProductionPlan]:
        """
        Get production plan by ID
        
        Args:
            db: Database session
            plan_id: ID of plan
            
        Returns:
            ProductionPlan or None if not found
        """
        return db.query(ProductionPlan).filter(ProductionPlan.id == plan_id).first()
    
    @staticmethod
    def list_plans_by_command(
        db: Session,
        command_id: int
    ) -> List[ProductionPlan]:
        """
        Get all production plans for a command
        
        Args:
            db: Database session
            command_id: ID of command
            
        Returns:
            List of ProductionPlan objects
        """
        return db.query(ProductionPlan).filter(
            ProductionPlan.command_id == command_id
        ).all()
    
    @staticmethod
    def list_plans_by_machine(
        db: Session,
        machine_id: int,
        limit: int = 50,
        offset: int = 0
    ) -> Tuple[List[ProductionPlan], int]:
        """
        Get production plans for a specific machine
        
        Args:
            db: Database session
            machine_id: ID of machine
            limit: Maximum results
            offset: Results to skip
            
        Returns:
            Tuple of (plans list, total count)
        """
        query = db.query(ProductionPlan).filter(
            ProductionPlan.machine_id == machine_id
        )
        
        total = query.count()
        plans = query.order_by(desc(ProductionPlan.created_at)).offset(offset).limit(limit).all()
        
        return plans, total
    
    @staticmethod
    def delete_plan(db: Session, plan_id: int) -> bool:
        """
        Delete a production plan (cascade deletes assignments)
        
        Args:
            db: Database session
            plan_id: ID of plan
            
        Returns:
            True if deleted, False if not found
        """
        plan = db.query(ProductionPlan).filter(ProductionPlan.id == plan_id).first()
        
        if not plan:
            return False
        
        db.delete(plan)
        db.commit()
        
        logger.info("Deleted production plan %s", plan_id)
        return True
    
    @staticmethod
    def get_plan_summary(db: Session, plan_id: int) -> Dict:
        """
        Get detailed summary of a production plan
        
        Args:
            db: Database session
            plan_id: ID of plan
            
        Returns:
            Dictionary with plan details and assignments
            
        Raises:
            ValueError: If plan not found
        """
        plan = db.query(ProductionPlan).filter(ProductionPlan.id == plan_id).first()
        
        if not plan:
            raise ValueError(f"Production plan {plan_id} not found")
        
        # Get assignments
        assignments = db.query(PlanAssignment).filter(
            PlanAssignment.production_plan_id == plan_id
        ).all()

        _component_ids = [a.component_id for a in assignments]
        _components_by_id = {
            c.id: c
            for c in db.query(Component).filter(Component.id.in_(_component_ids)).all()
        } if _component_ids else {}

        assignment_details = []
        total_items = 0
        
        for assignment in assignments:
            component = _components_by_id.get(assignment.component_id)
            
            total_items += assignment.quantity
            
            assignment_details.append({
                "id": assignment.id,
                "feeder_position": assignment.feeder_position,
                "component_id": assignment.component_id,
                "component_reference": component.reference if component else "Unknown",
                "component_value": component.value if component else "Unknown",
                "component_name": (component.mpn or component.value or component.reference) if component else "Unknown",
                "component_type": (
                    component.package or component.footprint_pnp or component.footprint_eagle or "Unknown"
                ) if component else "Unknown",
                "quantity": assignment.quantity
            })
        
        # Sort by feeder position
        assignment_details.sort(key=lambda x: x["feeder_position"])
        
        return {
            "id": plan.id,
            "command_id": plan.command_id,
            "machine_id": plan.machine_id,
            "created_at": plan.created_at.isoformat(),
            "notes": plan.notes,
            "assignments_count": len(assignments),
            "total_items_to_place": total_items,
            "assignments": assignment_details
        }
    
    @staticmethod
    def validate_plan_completeness(db: Session, plan_id: int) -> Dict:
        """
        Validate if all components from command items are assigned in plan
        
        Args:
            db: Database session
            plan_id: ID of plan
            
        Returns:
            Dictionary with validation results
            
        Raises:
            ValueError: If plan not found
        """
        plan = db.query(ProductionPlan).filter(ProductionPlan.id == plan_id).first()
        
        if not plan:
            raise ValueError(f"Production plan {plan_id} not found")
        
        command_items = db.query(CommandItem).filter(
            CommandItem.command_id == plan.command_id
        ).all()
        component_lookup = ComponentLibraryService.build_lookup(db.query(Component).all())

        # Build revision → qty map; single IN query instead of one query per revision.
        qty_by_revision_v: Dict[int, int] = {ci.bom_revision_id: ci.quantity_to_produce for ci in command_items}
        revision_ids_v = list(qty_by_revision_v.keys())

        all_bom_items_v = (
            db.query(BomItem)
            .filter(
                BomItem.bom_revision_id.in_(revision_ids_v),
                or_(BomItem.dnp == False, BomItem.dnp.is_(None)),  # noqa: E712 (SQL Server: IS NOT 1 invalide; inclut les lignes dnp NULL legacy)
            )
            .all()
        ) if revision_ids_v else []

        required_components: Dict[object, Dict] = {}

        for bom_item in all_bom_items_v:
            qty_to_produce_v = qty_by_revision_v.get(bom_item.bom_revision_id, 1)
            matched_component = ProductionService._match_component_for_bom_item(component_lookup, bom_item)
            component_key: object = matched_component.id if matched_component else f"UNRESOLVED:{bom_item.id}"
            component_entry = required_components.setdefault(
                component_key,
                {
                    "component_id": matched_component.id if matched_component else None,
                    "reference": bom_item.reference_item,
                    "value": bom_item.value_harmonized or bom_item.value_raw,
                    "resolved": matched_component is not None,
                },
            )
            component_entry["quantity"] = component_entry.get("quantity", 0) + (
                (bom_item.quantity or 1) * qty_to_produce_v
            )

        assignments = db.query(PlanAssignment).filter(
            PlanAssignment.production_plan_id == plan_id
        ).all()

        assigned_components: Dict[int, int] = {}
        for assignment in assignments:
            assigned_components[assignment.component_id] = (
                assigned_components.get(assignment.component_id, 0) + assignment.quantity
            )

        missing_components = []
        for comp_key, comp_info in required_components.items():
            required_qty = comp_info["quantity"]
            assigned_qty = assigned_components.get(comp_info["component_id"], 0) if comp_info["resolved"] else 0
            if assigned_qty < required_qty:
                missing_components.append(
                    {
                        "component_id": comp_info["component_id"],
                        "reference": comp_info["reference"],
                        "value": comp_info["value"],
                        "required": required_qty,
                        "assigned": assigned_qty,
                        "missing": required_qty - assigned_qty,
                    }
                )
        return missing_components
