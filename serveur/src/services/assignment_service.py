"""Service for managing machine assignments and feeder configurations."""

import json
import logging
from datetime import datetime
from typing import List, Dict, Optional, Tuple

from sqlalchemy import and_, or_
from sqlalchemy.orm import Session, joinedload

from ..database import utcnow
from ..models.bom import BomItem, BomReference, BomRevision, Component
from ..models.commands import PlanAssignment, ProductionPlan
from ..models.machines import PnpCart, PnpFeeder, PnpMachine
from ..models.production import Production, ProductionBomRevision
from .assignment_fixed_feeders import AssignmentFixedFeederMixin
from .component_library_service import ComponentLibraryService
from .assignment_planning import AssignmentPlanningMixin
from .pnp_export_service import build_pnp_export
from ..utils.nozzles import normalize_nozzle_layout
from ..utils.pnp_export import (
    normalize_back_order as normalize_feeder_back_order,
    normalize_columns as normalize_export_columns,
    normalize_format as normalize_export_format,
    normalize_separator as normalize_export_separator,
)


def _serialize_nozzle_layout(layout, num_nozzles):
    """Liste de types nozzle → JSON (ou None si pas de nozzles/layout vide)."""
    normalized = normalize_nozzle_layout(layout, num_nozzles)
    return json.dumps(normalized) if normalized else None
from .assignment_helpers import (
    build_assignment_payload,
    build_bom_assignment_summaries,
    build_slot_payload,
    build_unassigned_payload,
    cart_kind_value,
    component_display_label,
    component_slot_usage,
    extract_feeder_size_mm,
    fixed_feeder_sort_key,
    normalize_category_key,
    parse_cart_kind,
    serialize_cart,
    serialize_fixed_feeder_component,
    serialize_machine,
    serialize_machine_production,
    sort_production_bom_links,
)

logger = logging.getLogger(__name__)


class AssignmentService(AssignmentFixedFeederMixin, AssignmentPlanningMixin):
    """Service for managing machine and feeder assignments."""

    @staticmethod
    def _serialize_cart(cart: PnpCart) -> Dict:
        return serialize_cart(cart)

    @staticmethod
    def _serialize_machine(machine: PnpMachine) -> Dict:
        return serialize_machine(machine)

    # fixed-feeder logic lives in AssignmentFixedFeederMixin
    
    @staticmethod
    def create_machine(
        db: Session,
        name: str,
        num_positions: int,
        num_nozzles: Optional[int] = None,
        nozzle_layout: Optional[List[int]] = None,
        export_format: Optional[str] = None,
        export_columns: Optional[List[str]] = None,
        export_separator: Optional[str] = None,
        feeder_back_order: Optional[str] = None,
        description: Optional[str] = None,
        notes: Optional[str] = None
    ) -> PnpMachine:
        """
        Create a new PnP machine
        
        Args:
            db: Database session
            name: Machine name
            num_positions: Number of feeder positions (typically 60 or 80)
            description: Machine description
            notes: Optional notes
            
        Returns:
            Created PnpMachine
            
        Raises:
            ValueError: If name exists or num_positions invalid
        """
        if not name or not name.strip():
            raise ValueError("Machine name cannot be empty")
        
        if num_positions < 1 or num_positions > 200:
            raise ValueError(f"Invalid number of positions: {num_positions}. Must be 1-200")
        
        # Check if machine with name exists
        existing = db.query(PnpMachine).filter(PnpMachine.name == name.strip()).first()
        if existing:
            raise ValueError(f"Machine '{name}' already exists")
        
        resolved_nozzles = num_nozzles or None
        machine = PnpMachine(
            name=name.strip(),
            num_positions=num_positions,
            num_nozzles=resolved_nozzles,
            nozzle_layout=_serialize_nozzle_layout(nozzle_layout, resolved_nozzles),
            export_format=normalize_export_format(export_format) if export_format else None,
            export_columns=(
                json.dumps(normalize_export_columns(export_columns))
                if export_columns is not None else None
            ),
            export_separator=normalize_export_separator(export_separator) if export_separator else None,
            feeder_back_order=normalize_feeder_back_order(feeder_back_order) if feeder_back_order else None,
            description=description.strip() if description else None,
            notes=notes.strip() if notes else None
        )
        
        db.add(machine)
        db.commit()
        db.refresh(machine)
        
        logger.info("Created machine: %s with %s positions (ID: %s)", machine.name, num_positions, machine.id)
        return machine
    
    @staticmethod
    def get_machine_by_id(db: Session, machine_id: int) -> Optional[PnpMachine]:
        """
        Get machine by ID
        
        Args:
            db: Database session
            machine_id: ID of machine
            
        Returns:
            PnpMachine or None
        """
        return (
            db.query(PnpMachine)
            .options(
                joinedload(PnpMachine.feeders),
                joinedload(PnpMachine.production_plans),
                joinedload(PnpMachine.productions),
            )
            .filter(PnpMachine.id == machine_id)
            .first()
        )
    
    @staticmethod
    def get_machine_by_name(db: Session, name: str) -> Optional[PnpMachine]:
        """
        Get machine by name
        
        Args:
            db: Database session
            name: Machine name
            
        Returns:
            PnpMachine or None
        """
        return db.query(PnpMachine).filter(PnpMachine.name == name.strip()).first()
    
    @staticmethod
    def list_machines(
        db: Session,
        limit: int = 50,
        offset: int = 0
    ) -> Tuple[List[PnpMachine], int]:
        """
        List all PnP machines
        
        Args:
            db: Database session
            limit: Maximum results
            offset: Results to skip
            
        Returns:
            Tuple of (machines list, total count)
        """
        query = db.query(PnpMachine)
        total = query.count()
        machines = (
            query
            .options(
                joinedload(PnpMachine.feeders),
                joinedload(PnpMachine.production_plans),
                joinedload(PnpMachine.productions),
            )
            .order_by(PnpMachine.name)
            .offset(offset)
            .limit(limit)
            .all()
        )
        
        return machines, total
    
    @staticmethod
    def update_machine(
        db: Session,
        machine_id: int,
        name: Optional[str] = None,
        num_positions: Optional[int] = None,
        num_nozzles: Optional[int] = None,
        nozzle_layout: Optional[List[int]] = None,
        export_format: Optional[str] = None,
        export_columns: Optional[List[str]] = None,
        export_separator: Optional[str] = None,
        feeder_back_order: Optional[str] = None,
        description: Optional[str] = None,
        notes: Optional[str] = None
    ) -> PnpMachine:
        """
        Update machine information
        
        Args:
            db: Database session
            machine_id: ID of machine
            name: New name (optional)
            num_positions: New number of positions (optional)
            description: New description (optional)
            notes: New notes (optional)
            
        Returns:
            Updated PnpMachine
            
        Raises:
            ValueError: If machine not found or name already exists
        """
        machine = db.query(PnpMachine).filter(PnpMachine.id == machine_id).first()
        if not machine:
            raise ValueError(f"Machine {machine_id} not found")
        
        if name:
            name_clean = name.strip()
            # Check if new name already exists on different machine
            existing = db.query(PnpMachine).filter(
                and_(
                    PnpMachine.name == name_clean,
                    PnpMachine.id != machine_id
                )
            ).first()
            if existing:
                raise ValueError(f"Machine name '{name}' already exists")
            machine.name = name_clean

        if num_positions is not None:
            if num_positions < 1 or num_positions > 200:
                raise ValueError(f"Invalid number of positions: {num_positions}. Must be 1-200")
            machine.num_positions = num_positions

        if num_nozzles is not None:
            if num_nozzles < 0 or num_nozzles > 40:
                raise ValueError(f"Invalid number of nozzles: {num_nozzles}. Must be 0-40")
            machine.num_nozzles = num_nozzles or None
            # Re-cale le layout existant sur le nouveau nb de nozzles si pas de
            # nouveau layout fourni (tronque/complète par le défaut).
            if nozzle_layout is None:
                existing = None
                if machine.nozzle_layout:
                    try:
                        existing = json.loads(machine.nozzle_layout)
                    except (TypeError, ValueError):
                        existing = None
                machine.nozzle_layout = _serialize_nozzle_layout(
                    existing if isinstance(existing, list) else None, machine.num_nozzles,
                )

        if nozzle_layout is not None:
            machine.nozzle_layout = _serialize_nozzle_layout(nozzle_layout, machine.num_nozzles)

        if export_format is not None:
            machine.export_format = normalize_export_format(export_format)

        if export_columns is not None:
            machine.export_columns = json.dumps(normalize_export_columns(export_columns))

        if export_separator is not None:
            machine.export_separator = normalize_export_separator(export_separator)

        if feeder_back_order is not None:
            machine.feeder_back_order = normalize_feeder_back_order(feeder_back_order)

        if description is not None:
            machine.description = description.strip() if description else None
        
        if notes is not None:
            machine.notes = notes.strip() if notes else None
        
        db.commit()
        db.refresh(machine)
        
        logger.info("Updated machine %s", machine_id)
        return machine
    
    @staticmethod
    def delete_machine(db: Session, machine_id: int) -> bool:
        """
        Delete a machine (cascade deletes production plans)
        
        Args:
            db: Database session
            machine_id: ID of machine
            
        Returns:
            True if deleted, False if not found
        """
        machine = (
            db.query(PnpMachine)
            .options(
                joinedload(PnpMachine.feeders),
                joinedload(PnpMachine.production_plans).joinedload(ProductionPlan.assignments),
            )
            .filter(PnpMachine.id == machine_id)
            .first()
        )
        
        if not machine:
            return False
        
        db.delete(machine)
        db.commit()

        logger.info("Deleted machine %s", machine_id)
        return True

    @classmethod
    def export_machine_production_config(
        cls,
        db: Session,
        machine_id: int,
        production_id: int,
        bom_revision_id: Optional[int] = None,
        export_format: Optional[str] = None,
        export_columns: Optional[List[str]] = None,
        export_separator: Optional[str] = None,
    ) -> Tuple[str, str, str]:
        """Génère le fichier d'export PnP (CSV/TXT) d'une production sur une machine.

        Réutilise l'implantation calculée (slots feeders + nozzles) pour renseigner les
        colonnes Feeder/Nozzle. Retourne (filename, media_type, content).
        """
        # Calcul de l'implantation : valide aussi le lien machine↔production.
        plan = cls.get_machine_production_feeder_plan(
            db=db,
            machine_id=machine_id,
            production_id=production_id,
            bom_revision_id=bom_revision_id,
        )
        assignment_by_component = {
            assignment["component_id"]: assignment
            for assignment in plan.get("slot_assignments", [])
        }

        machine = cls.get_machine_by_id(db=db, machine_id=machine_id)
        if not machine:
            raise ValueError(f"Machine {machine_id} not found")

        production = (
            db.query(Production)
            .options(
                joinedload(Production.bom_links)
                .joinedload(ProductionBomRevision.revision)
                .joinedload(BomRevision.items)
            )
            .filter(Production.id == production_id)
            .first()
        )
        if not production:
            raise ValueError(f"Production {production_id} not found")

        return build_pnp_export(
            db=db,
            machine=machine,
            production=production,
            bom_revision_id=bom_revision_id,
            export_format=export_format,
            export_columns=export_columns,
            export_separator=export_separator,
            assignment_by_component=assignment_by_component,
        )

    @staticmethod
    def create_cart(
        db: Session,
        name: str,
        capacity_positions: int,
        kind: Optional[str] = None,
        target_category: Optional[str] = None,
        description: Optional[str] = None,
        notes: Optional[str] = None,
    ) -> PnpCart:
        """Create a logical feeder cart used for fixed components."""
        normalized_name = (name or "").strip()
        if not normalized_name:
            raise ValueError("Cart name cannot be empty")
        if capacity_positions < 1 or capacity_positions > 500:
            raise ValueError("Cart capacity must be between 1 and 500 positions")

        normalized_kind = parse_cart_kind(kind)
        normalized_category = target_category.strip() if target_category else None
        if normalized_kind == PnpCart.KindEnum.CATEGORY and not normalized_category:
            raise ValueError("Category carts require a target_category")
        if normalized_kind != PnpCart.KindEnum.CATEGORY:
            normalized_category = None

        existing = db.query(PnpCart).filter(PnpCart.name == normalized_name).first()
        if existing:
            raise ValueError(f"Cart '{normalized_name}' already exists")

        cart = PnpCart(
            name=normalized_name,
            kind=normalized_kind,
            target_category=normalized_category,
            capacity_positions=capacity_positions,
            description=description.strip() if description else None,
            notes=notes.strip() if notes else None,
        )
        db.add(cart)
        db.commit()
        db.refresh(cart)

        logger.info("Created cart %s (ID: %s)", cart.name, cart.id)
        return cart

    @staticmethod
    def get_cart_by_id(db: Session, cart_id: int) -> Optional[PnpCart]:
        """Get a cart by ID."""
        return (
            db.query(PnpCart)
            .options(joinedload(PnpCart.components))
            .filter(PnpCart.id == cart_id)
            .first()
        )

    @staticmethod
    def list_carts(
        db: Session,
        limit: int = 50,
        offset: int = 0,
    ) -> Tuple[List[Dict], int]:
        """List carts with their current fixed-component occupancy."""
        base_query = db.query(PnpCart)
        total = base_query.count()
        carts = (
            base_query
            .options(joinedload(PnpCart.components))
            .order_by(PnpCart.name)
            .offset(offset)
            .limit(limit)
            .all()
        )
        return [serialize_cart(cart) for cart in carts], total

    @staticmethod
    def update_cart(
        db: Session,
        cart_id: int,
        name: Optional[str] = None,
        capacity_positions: Optional[int] = None,
        kind: Optional[str] = None,
        target_category: Optional[str] = None,
        description: Optional[str] = None,
        notes: Optional[str] = None,
    ) -> PnpCart:
        """Update a logical feeder cart."""
        cart = db.query(PnpCart).filter(PnpCart.id == cart_id).first()
        if not cart:
            raise ValueError(f"Cart {cart_id} not found")

        if name is not None:
            normalized_name = name.strip()
            if not normalized_name:
                raise ValueError("Cart name cannot be empty")
            duplicate = db.query(PnpCart).filter(
                and_(PnpCart.name == normalized_name, PnpCart.id != cart_id)
            ).first()
            if duplicate:
                raise ValueError(f"Cart '{normalized_name}' already exists")
            cart.name = normalized_name

        if capacity_positions is not None:
            if capacity_positions < 1 or capacity_positions > 500:
                raise ValueError("Cart capacity must be between 1 and 500 positions")
            cart.capacity_positions = capacity_positions

        next_kind = parse_cart_kind(kind) if kind is not None else cart.kind
        next_category = target_category.strip() if target_category is not None and target_category else cart.target_category
        if next_kind == PnpCart.KindEnum.CATEGORY and not next_category:
            raise ValueError("Category carts require a target_category")
        if next_kind != PnpCart.KindEnum.CATEGORY:
            next_category = None

        cart.kind = next_kind
        cart.target_category = next_category

        if description is not None:
            cart.description = description.strip() if description else None
        if notes is not None:
            cart.notes = notes.strip() if notes else None

        cart.updated_at = utcnow()
        db.commit()
        db.refresh(cart)

        logger.info("Updated cart %s", cart_id)
        return cart

    @staticmethod
    def delete_cart(db: Session, cart_id: int) -> bool:
        """Delete a cart and clear fixed-feeder assignments from linked components."""
        cart = db.query(PnpCart).filter(PnpCart.id == cart_id).first()
        if not cart:
            return False

        db.query(Component).filter(Component.fixed_cart_id == cart_id).update(
            {
                Component.fixed_cart_id: None,
                Component.is_fixed_feeder: False,
            },
            synchronize_session=False,
        )
        db.delete(cart)
        db.commit()

        logger.info("Deleted cart %s", cart_id)
        return True
    
    @staticmethod
    def create_feeder_type(
        db: Session,
        size_mm: int,
        capacity: Optional[int] = None,
        description: Optional[str] = None,
        notes: Optional[str] = None
    ) -> PnpFeeder:
        """
        Create a new feeder type/size
        
        Args:
            db: Database session
            size_mm: Feeder size in mm (typically 8, 12, 16)
            capacity: Component capacity per feeder
            description: Description
            notes: Optional notes
            
        Returns:
            Created PnpFeeder
            
        Raises:
            ValueError: If size already exists or invalid
        """
        if size_mm < 1 or size_mm > 100:
            raise ValueError(f"Invalid feeder size: {size_mm}")
        
        existing = db.query(PnpFeeder).filter(PnpFeeder.size_mm == size_mm).first()
        if existing:
            raise ValueError(f"Feeder size {size_mm}mm already exists")
        
        feeder = PnpFeeder(
            size_mm=size_mm,
            capacity=capacity,
            description=description.strip() if description else None,
            notes=notes.strip() if notes else None
        )
        
        db.add(feeder)
        db.commit()
        db.refresh(feeder)
        
        logger.info("Created feeder type: %smm (ID: %s)", size_mm, feeder.id)
        return feeder
    
    @staticmethod
    def get_feeder_by_id(db: Session, feeder_id: int) -> Optional[PnpFeeder]:
        """
        Get feeder type by ID
        
        Args:
            db: Database session
            feeder_id: ID of feeder
            
        Returns:
            PnpFeeder or None
        """
        return db.query(PnpFeeder).filter(PnpFeeder.id == feeder_id).first()
    
    @staticmethod
    def get_feeder_by_size(db: Session, size_mm: int) -> Optional[PnpFeeder]:
        """
        Get feeder type by size
        
        Args:
            db: Database session
            size_mm: Feeder size in mm
            
        Returns:
            PnpFeeder or None
        """
        return db.query(PnpFeeder).filter(PnpFeeder.size_mm == size_mm).first()
    
    @staticmethod
    def list_feeders(
        db: Session,
        limit: int = 50,
        offset: int = 0
    ) -> Tuple[List[PnpFeeder], int]:
        """
        List all feeder types
        
        Args:
            db: Database session
            limit: Maximum results
            offset: Results to skip
            
        Returns:
            Tuple of (feeders list, total count)
        """
        query = db.query(PnpFeeder)
        total = query.count()
        feeders = query.order_by(PnpFeeder.size_mm).offset(offset).limit(limit).all()
        
        return feeders, total
    
    @staticmethod
    def update_feeder(
        db: Session,
        feeder_id: int,
        capacity: Optional[int] = None,
        description: Optional[str] = None,
        notes: Optional[str] = None
    ) -> PnpFeeder:
        """
        Update feeder type information
        
        Args:
            db: Database session
            feeder_id: ID of feeder
            capacity: New capacity (optional)
            description: New description (optional)
            notes: New notes (optional)
            
        Returns:
            Updated PnpFeeder
            
        Raises:
            ValueError: If feeder not found
        """
        feeder = db.query(PnpFeeder).filter(PnpFeeder.id == feeder_id).first()
        if not feeder:
            raise ValueError(f"Feeder {feeder_id} not found")
        
        if capacity is not None:
            if capacity < 1:
                raise ValueError(f"Capacity must be at least 1")
            feeder.capacity = capacity
        
        if description is not None:
            feeder.description = description.strip() if description else None
        
        if notes is not None:
            feeder.notes = notes.strip() if notes else None
        
        db.commit()
        db.refresh(feeder)
        
        logger.info("Updated feeder %s", feeder_id)
        return feeder
    
    @staticmethod
    def delete_feeder(db: Session, feeder_id: int) -> bool:
        """
        Delete a feeder type
        
        Args:
            db: Database session
            feeder_id: ID of feeder type
            
        Returns:
            True if deleted, False if not found
        """
        feeder = db.query(PnpFeeder).filter(PnpFeeder.id == feeder_id).first()
        
        if not feeder:
            return False
        
        # Remove association with all machines
        feeder.machines.clear()
        
        db.delete(feeder)
        db.commit()
        
        logger.info("Deleted feeder type %s", feeder_id)
        return True
    
    @staticmethod
    def assign_feeder_to_machine(
        db: Session,
        machine_id: int,
        feeder_id: int
    ) -> bool:
        """
        Assign a feeder type to a machine (make it available on machine)
        
        Args:
            db: Database session
            machine_id: ID of machine
            feeder_id: ID of feeder type
            
        Returns:
            True if assigned, False if already assigned
            
        Raises:
            ValueError: If machine or feeder not found
        """
        machine = db.query(PnpMachine).filter(PnpMachine.id == machine_id).first()
        if not machine:
            raise ValueError(f"Machine {machine_id} not found")
        
        feeder = db.query(PnpFeeder).filter(PnpFeeder.id == feeder_id).first()
        if not feeder:
            raise ValueError(f"Feeder {feeder_id} not found")
        
        # Check if already assigned
        if feeder in machine.feeders:
            logger.warning("Feeder %s already assigned to machine %s", feeder_id, machine_id)
            return False
        
        machine.feeders.append(feeder)
        db.commit()
        
        logger.info("Assigned feeder %s to machine %s", feeder_id, machine_id)
        return True
    
    @staticmethod
    def remove_feeder_from_machine(
        db: Session,
        machine_id: int,
        feeder_id: int
    ) -> bool:
        """
        Remove a feeder type from a machine
        
        Args:
            db: Database session
            machine_id: ID of machine
            feeder_id: ID of feeder type
            
        Returns:
            True if removed, False if not assigned
            
        Raises:
            ValueError: If machine or feeder not found
        """
        machine = db.query(PnpMachine).filter(PnpMachine.id == machine_id).first()
        if not machine:
            raise ValueError(f"Machine {machine_id} not found")
        
        feeder = db.query(PnpFeeder).filter(PnpFeeder.id == feeder_id).first()
        if not feeder:
            raise ValueError(f"Feeder {feeder_id} not found")
        
        if feeder not in machine.feeders:
            return False
        
        machine.feeders.remove(feeder)
        db.commit()
        
        logger.info("Removed feeder %s from machine %s", feeder_id, machine_id)
        return True
