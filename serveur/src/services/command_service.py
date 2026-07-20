"""
Service for managing production commands
Handles creation, modification, and querying of production commands
"""

from io import BytesIO
from datetime import datetime
from typing import List, Dict, Optional, Tuple
import logging

from openpyxl import Workbook
from sqlalchemy import and_, desc, or_
from sqlalchemy.orm import Session, joinedload

from ..database import utcnow
from ..models.bom import BomItem, BomReference, BomRevision, Component
from ..models.commands import Command, CommandItem, CommandReceipt
from ..models.machines import PnpMachine
from ..models.production import Production
from .component_library_service import ComponentLibraryService
from ..utils.feeder_types import normalize_component_feeder_type

logger = logging.getLogger(__name__)


class CommandService:
    """Service for managing production commands"""

    # ERP "Nouvelle Demande d'Achat" columns (12) — mapped to the ERP form.
    # See docs/audits/Audit_2026-06-03_integration_api_fournisseurs.md §6.2.
    ERP_HEADERS = [
        "Référence fournisseur",
        "Fournisseur",
        "Description",
        "Lien web",
        "Référence KT",
        "Quantité",
        "Unité",
        "Projet",
        "Demandeur",
        "Validateur",
        "Délai",
        "Remarques",
    ]

    # Canonical supplier code -> label expected by the ERP import.
    SUPPLIER_LABELS = {
        "MOUSER": "Mouser",
        "DIGIKEY": "Digi-Key",
        "FARNELL": "Farnell",
        "RS": "RS",
    }

    @staticmethod
    def _clean_export_text(value: Optional[str]) -> str:
        if value is None:
            return ""
        return str(value).strip()

    @classmethod
    def _supplier_label(cls, supplier_code: Optional[str], default: Optional[str] = None) -> str:
        if not supplier_code:
            return cls._clean_export_text(default)
        return cls.SUPPLIER_LABELS.get(supplier_code.upper(), supplier_code)

    @classmethod
    def _build_description(cls, line: Dict, offer: Optional[Dict]) -> str:
        manufacturer = (offer or {}).get("manufacturer")
        mpn = (offer or {}).get("mpn") or line.get("component_mpn")
        value = line.get("value")
        footprint = line.get("footprint")
        parts = [p for p in (manufacturer, mpn) if p]
        head = " ".join(parts) if parts else cls._clean_export_text(value)
        tail = " / ".join(p for p in (value, footprint) if p and p != head)
        return cls._clean_export_text(f"{head} — {tail}" if tail else head)

    @classmethod
    def _build_erp_export_rows(
        cls,
        command_summary: Dict,
        defaults: Dict[str, str],
        offers_by_component: Optional[Dict[int, Dict]] = None,
        line_overrides: Optional[Dict[str, int]] = None,
    ) -> List[Dict[str, object]]:
        rows: List[Dict[str, object]] = []
        overrides = line_overrides or {}
        offers_by_component = offers_by_component or {}

        for line in command_summary.get("aggregated_components", []):
            offer = offers_by_component.get(line.get("component_library_id")) or {}

            supplier_reference = cls._clean_export_text(
                offer.get("supplier_part")
                or line.get("supplier_code")
                or offer.get("mpn")
                or line.get("component_mpn")
            )
            supplier_label = cls._supplier_label(
                offer.get("supplier"), defaults.get("default_supplier")
            )
            product_url = cls._clean_export_text(offer.get("product_url") or line.get("supplier_link"))
            # Quantité à commander = override manuel, sinon besoin − stock réel disponible.
            # On n'exporte QUE les lignes à commander (> 0) : les composants couverts par
            # le stock sont exclus du fichier ERP (choix Eric 2026-07-09).
            override_qty = overrides.get(line.get("key"))
            if override_qty is not None:
                export_quantity = int(override_qty or 0)
            else:
                besoin = int(line.get("quantity") or 0)
                stock_available = line.get("stock_available")
                export_quantity = besoin if stock_available is None else max(besoin - int(stock_available), 0)
            if export_quantity <= 0:
                continue

            rows.append(
                {
                    "Référence fournisseur": supplier_reference,
                    "Fournisseur": supplier_label,
                    "Description": cls._build_description(line, offer),
                    "Lien web": product_url,
                    # Référence KT : champ interne société, rempli à la main dans
                    # l'ERP — toujours vide à l'export (demande Eric 2026-06-06,
                    # remplace le mapping COMPONENTS.reference de l'audit §6.2).
                    "Référence KT": "",
                    "Quantité": export_quantity,
                    "Unité": cls._clean_export_text(defaults.get("unit")),
                    "Projet": cls._clean_export_text(defaults.get("project")),
                    "Demandeur": cls._clean_export_text(defaults.get("requester")),
                    "Validateur": cls._clean_export_text(defaults.get("validator")),
                    "Délai": cls._clean_export_text(defaults.get("delay")),
                    "Remarques": cls._clean_export_text(defaults.get("remark")),
                }
            )

        return rows

    @classmethod
    def export_command_erp_workbook(
        cls,
        db: Session,
        command_id: int,
        defaults: Dict[str, str],
        sort_strategy: str = "cheapest",
        priority_supplier: Optional[str] = None,
        line_overrides: Optional[Dict[str, int]] = None,
    ) -> Tuple[BytesIO, str]:
        """Build the ERP purchase-list workbook for a command.

        ``defaults`` carries the ERP context (project, unit, requester, validator,
        delay, remark, default_supplier). Supplier columns are filled from the
        retained offer per component (cached), per the chosen sort strategy.
        """
        from .supplier_offer_service import SupplierOfferService  # avoid import cycle

        summary = cls.get_command_summary(db=db, command_id=command_id)

        component_quantities = {
            line["component_library_id"]: line.get("quantity") or 1
            for line in summary.get("aggregated_components", [])
            if line.get("component_library_id")
        }
        offers_by_component = SupplierOfferService.best_offers_for_components(
            db,
            component_quantities,
            strategy=sort_strategy,
            priority_supplier=priority_supplier,
        )

        workbook = Workbook()
        worksheet = workbook.active
        worksheet.title = "Purchase List ERP"
        worksheet.append(cls.ERP_HEADERS)

        for row in cls._build_erp_export_rows(
            command_summary=summary,
            defaults=defaults,
            offers_by_component=offers_by_component,
            line_overrides=line_overrides,
        ):
            worksheet.append([row[header] for header in cls.ERP_HEADERS])

        buffer = BytesIO()
        workbook.save(buffer)
        buffer.seek(0)
        safe_name = "".join(char if char.isalnum() or char in ("-", "_") else "_" for char in summary["name"]).strip("_")
        filename = f"{safe_name or 'purchase_list'}_ERP.xlsx"
        return buffer, filename
    
    @staticmethod
    def create_command(
        db: Session,
        name: str,
        notes: Optional[str] = None,
        production_id: Optional[int] = None,
    ) -> Command:
        """
        Create a new production command
        
        Args:
            db: Database session
            name: Command name/reference
            notes: Optional notes about the command
            
        Returns:
            Created Command object
            
        Raises:
            ValueError: If name is empty or command with same name already exists
        """
        if not name or not name.strip():
            raise ValueError("Command name cannot be empty")
        
        # Check if command with this name already exists
        existing = db.query(Command).filter(Command.name == name.strip()).first()
        if existing:
            raise ValueError(f"Command '{name}' already exists")
        
        if production_id is not None:
            production = db.query(Production.id).filter(Production.id == production_id).first()
            if not production:
                raise ValueError(f"Production {production_id} not found")

        command = Command(
            name=name.strip(),
            notes=notes.strip() if notes else None,
            status=Command.StatusEnum.DRAFT,
            production_id=production_id,
        )
        
        db.add(command)
        db.commit()
        db.refresh(command)
        
        logger.info("Created command: %s (ID: %s)", command.name, command.id)
        return command

    @staticmethod
    def create_command_with_items(
        db: Session,
        name: str,
        items: List[Dict[str, int]],
        notes: Optional[str] = None,
        production_id: Optional[int] = None,
    ) -> Command:
        """
        Create a command and all its BOM items in a single transaction.

        Args:
            db: Database session
            name: Command name/reference
            items: List of {"bom_revision_id": int, "quantity": int}
            notes: Optional notes about the command

        Returns:
            Created Command object

        Raises:
            ValueError: If name/items are invalid or references are missing/duplicated
        """
        if not name or not name.strip():
            raise ValueError("Command name cannot be empty")

        if not items:
            raise ValueError("Command must contain at least one BOM revision")

        normalized_name = name.strip()
        existing = db.query(Command).filter(Command.name == normalized_name).first()
        if existing:
            raise ValueError(f"Command '{normalized_name}' already exists")

        if production_id is not None:
            production = db.query(Production.id).filter(Production.id == production_id).first()
            if not production:
                raise ValueError(f"Production {production_id} not found")

        normalized_items: List[Dict[str, int]] = []
        seen_revision_ids = set()
        for item in items:
            bom_revision_id = int(item.get("bom_revision_id") or 0)
            quantity = int(item.get("quantity") or 0)

            if bom_revision_id < 1:
                raise ValueError("Each command item must provide a valid BOM revision")
            if quantity < 1:
                raise ValueError(f"Quantity must be at least 1, got {quantity}")
            if bom_revision_id in seen_revision_ids:
                raise ValueError(f"BOM revision {bom_revision_id} appears multiple times in the same command")

            seen_revision_ids.add(bom_revision_id)
            normalized_items.append(
                {
                    "bom_revision_id": bom_revision_id,
                    "quantity": quantity,
                }
            )

        revision_ids = [item["bom_revision_id"] for item in normalized_items]
        existing_revisions = {
            revision_id
            for (revision_id,) in db.query(BomRevision.id).filter(BomRevision.id.in_(revision_ids)).all()
        }
        missing_revisions = sorted(set(revision_ids) - existing_revisions)
        if missing_revisions:
            missing_label = ", ".join(str(revision_id) for revision_id in missing_revisions)
            raise ValueError(f"BOM revision(s) not found: {missing_label}")

        command = Command(
            name=normalized_name,
            notes=notes.strip() if notes else None,
            status=Command.StatusEnum.DRAFT,
            production_id=production_id,
        )
        db.add(command)
        db.flush()

        db.add_all(
            [
                CommandItem(
                    command_id=command.id,
                    bom_revision_id=item["bom_revision_id"],
                    quantity_to_produce=item["quantity"],
                )
                for item in normalized_items
            ]
        )

        db.commit()
        db.refresh(command)

        logger.info(
            "Created command with %s item(s): %s (ID: %s)",
            len(normalized_items),
            command.name,
            command.id,
        )
        return command
    
    @staticmethod
    def add_item_to_command(
        db: Session,
        command_id: int,
        bom_revision_id: int,
        quantity: int = 1
    ) -> CommandItem:
        """
        Add a BOM revision to a command with specified quantity
        
        Args:
            db: Database session
            command_id: ID of command
            bom_revision_id: ID of BOM revision
            quantity: Quantity to produce
            
        Returns:
            Created CommandItem object
            
        Raises:
            ValueError: If command/BOM doesn't exist, quantity invalid, or item already exists
        """
        # Validate command exists
        command = db.query(Command).filter(Command.id == command_id).first()
        if not command:
            raise ValueError(f"Command {command_id} not found")
        
        # Validate BOM revision exists
        bom_revision = db.query(BomRevision).filter(BomRevision.id == bom_revision_id).first()
        if not bom_revision:
            raise ValueError(f"BOM revision {bom_revision_id} not found")
        
        # Validate quantity
        if quantity < 1:
            raise ValueError(f"Quantity must be at least 1, got {quantity}")
        
        # Check if this BOM is already in command
        existing_item = db.query(CommandItem).filter(
            and_(
                CommandItem.command_id == command_id,
                CommandItem.bom_revision_id == bom_revision_id
            )
        ).first()
        
        if existing_item:
            raise ValueError(f"BOM revision {bom_revision_id} is already in command {command_id}")
        
        # Create command item
        item = CommandItem(
            command_id=command_id,
            bom_revision_id=bom_revision_id,
            quantity_to_produce=quantity
        )
        
        db.add(item)
        db.commit()
        db.refresh(item)
        
        logger.info("Added item to command %s: BOM %s x%s", command_id, bom_revision_id, quantity)
        return item
    
    @staticmethod
    def remove_item_from_command(
        db: Session,
        command_id: int,
        bom_revision_id: int
    ) -> bool:
        """
        Remove a BOM from a command
        
        Args:
            db: Database session
            command_id: ID of command
            bom_revision_id: ID of BOM revision
            
        Returns:
            True if removed, False if not found
        """
        item = db.query(CommandItem).filter(
            and_(
                CommandItem.command_id == command_id,
                CommandItem.bom_revision_id == bom_revision_id
            )
        ).first()
        
        if not item:
            return False
        
        db.delete(item)
        db.commit()
        
        logger.info("Removed BOM %s from command %s", bom_revision_id, command_id)
        return True
    
    @staticmethod
    def update_item_quantity(
        db: Session,
        command_id: int,
        bom_revision_id: int,
        new_quantity: int
    ) -> CommandItem:
        """
        Update the quantity for a command item
        
        Args:
            db: Database session
            command_id: ID of command
            bom_revision_id: ID of BOM revision
            new_quantity: New quantity value
            
        Returns:
            Updated CommandItem
            
        Raises:
            ValueError: If item not found or quantity invalid
        """
        if new_quantity < 1:
            raise ValueError(f"Quantity must be at least 1, got {new_quantity}")
        
        item = db.query(CommandItem).filter(
            and_(
                CommandItem.command_id == command_id,
                CommandItem.bom_revision_id == bom_revision_id
            )
        ).first()
        
        if not item:
            raise ValueError(f"Item not found in command {command_id}")
        
        item.quantity_to_produce = new_quantity
        db.commit()
        db.refresh(item)
        
        logger.info("Updated command %s item quantity to %s", command_id, new_quantity)
        return item
    
    @staticmethod
    def update_command_status(
        db: Session,
        command_id: int,
        new_status: str
    ) -> Command:
        """
        Update command status
        
        Args:
            db: Database session
            command_id: ID of command
            new_status: New status (DRAFT, READY, SENT, RECEIVED, ARCHIVED)
            
        Returns:
            Updated Command
            
        Raises:
            ValueError: If command not found or invalid status
        """
        # Validate status
        valid_statuses = [status.value for status in Command.StatusEnum]
        if new_status not in valid_statuses:
            raise ValueError(f"Invalid status. Must be one of: {', '.join(valid_statuses)}")
        
        command = db.query(Command).filter(Command.id == command_id).first()
        if not command:
            raise ValueError(f"Command {command_id} not found")
        
        old_status = command.status.value
        command.status = Command.StatusEnum(new_status)
        command.updated_at = utcnow()
        db.commit()
        db.refresh(command)
        
        logger.info("Command %s status changed: %s -> %s", command_id, old_status, new_status)
        return command

    @staticmethod
    def update_command(
        db: Session,
        command_id: int,
        *,
        name: Optional[str] = None,
        status: Optional[str] = None,
        notes: Optional[str] = None,
        notes_provided: bool = False,
    ) -> Command:
        """Update mutable command fields with the same validation rules as creation."""
        command = db.query(Command).filter(Command.id == command_id).first()
        if not command:
            raise ValueError(f"Command {command_id} not found")

        if status is not None:
            normalized_status = str(status).strip()
            valid_statuses = [item.value for item in Command.StatusEnum]
            if normalized_status not in valid_statuses:
                raise ValueError(f"Invalid status. Must be one of: {', '.join(valid_statuses)}")
            command.status = Command.StatusEnum(normalized_status)

        if name is not None:
            normalized_name = str(name).strip()
            if not normalized_name:
                raise ValueError("Command name cannot be empty")

            duplicate = (
                db.query(Command)
                .filter(Command.name == normalized_name, Command.id != command_id)
                .first()
            )
            if duplicate:
                raise ValueError(f"Command '{normalized_name}' already exists")

            command.name = normalized_name

        if notes_provided:
            command.notes = notes.strip() if notes else None

        command.updated_at = utcnow()
        db.commit()
        db.refresh(command)

        logger.info("Updated command %s", command_id)
        return command
    
    @staticmethod
    def get_command_by_id(db: Session, command_id: int) -> Optional[Command]:
        """
        Get command by ID
        
        Args:
            db: Database session
            command_id: ID of command
            
        Returns:
            Command object or None if not found
        """
        return db.query(Command).filter(Command.id == command_id).first()
    
    @staticmethod
    def list_commands(
        db: Session,
        status_filter: Optional[str] = None,
        production_id: Optional[int] = None,
        limit: int = 50,
        offset: int = 0
    ) -> Tuple[List[Command], int]:
        """
        List commands with optional filtering
        
        Args:
            db: Database session
            status_filter: Optional status to filter by
            limit: Maximum number of results
            offset: Number of results to skip
            
        Returns:
            Tuple of (command list, total count)
        """
        query = db.query(Command)

        if production_id is not None:
            query = query.filter(Command.production_id == production_id)
        
        if status_filter:
            try:
                status_enum = Command.StatusEnum(status_filter)
                query = query.filter(Command.status == status_enum)
            except ValueError:
                raise ValueError(f"Invalid status filter: {status_filter}")
        
        total = query.count()
        
        commands = query.order_by(desc(Command.created_at)).offset(offset).limit(limit).all()
        
        return commands, total
    
    @staticmethod
    def search_commands(
        db: Session,
        search_term: str,
        production_id: Optional[int] = None,
        limit: int = 50,
        offset: int = 0
    ) -> Tuple[List[Command], int]:
        """
        Search commands by name or notes
        
        Args:
            db: Database session
            search_term: Search term
            limit: Maximum number of results
            offset: Number of results to skip
            
        Returns:
            Tuple of (command list, total count)
        """
        search_pattern = f"%{search_term}%"
        
        query = db.query(Command).filter(
            or_(
                Command.name.ilike(search_pattern),
                Command.notes.ilike(search_pattern)
            )
        )

        if production_id is not None:
            query = query.filter(Command.production_id == production_id)
        
        total = query.count()
        commands = query.order_by(desc(Command.created_at)).offset(offset).limit(limit).all()
        
        return commands, total
    
    @staticmethod
    def delete_command(db: Session, command_id: int) -> bool:
        """
        Delete a command (cascade deletes items and plans)
        
        Args:
            db: Database session
            command_id: ID of command
            
        Returns:
            True if deleted, False if not found
        """
        command = db.query(Command).filter(Command.id == command_id).first()
        
        if not command:
            return False
        
        db.delete(command)
        db.commit()
        
        logger.info("Deleted command %s", command_id)
        return True

    @staticmethod
    def get_latest_command_for_production(db: Session, production_id: int) -> Optional[Command]:
        return (
            db.query(Command)
            .filter(Command.production_id == production_id)
            .order_by(desc(Command.updated_at), desc(Command.created_at), desc(Command.id))
            .first()
        )
    
    @staticmethod
    def get_command_summary(db: Session, command_id: int) -> Dict:
        """
        Get detailed summary of a command including items and statistics
        
        Args:
            db: Database session
            command_id: ID of command
            
        Returns:
            Dictionary with command details and statistics
            
        Raises:
            ValueError: If command not found
        """
        command = db.query(Command).filter(Command.id == command_id).first()
        
        if not command:
            raise ValueError(f"Command {command_id} not found")
        
        items = db.query(CommandItem).filter(CommandItem.command_id == command_id).all()
        revision_ids = [item.bom_revision_id for item in items]
        component_library_lookup = ComponentLibraryService.build_lookup(db.query(Component).all())
        revisions_by_id = {}
        bom_items_by_revision_id: Dict[int, List[BomItem]] = {}

        if revision_ids:
            revisions = (
                db.query(BomRevision)
                .options(joinedload(BomRevision.reference))
                .filter(BomRevision.id.in_(revision_ids))
                .all()
            )
            revisions_by_id = {revision.id: revision for revision in revisions}

            for bom_item in (
                db.query(BomItem)
                .filter(
                    BomItem.bom_revision_id.in_(revision_ids),
                    or_(BomItem.dnp == False, BomItem.dnp.is_(None)),  # noqa: E712 (SQL Server: IS NOT 1 invalide; inclut les lignes dnp NULL legacy)
                )
                .all()
            ):
                bom_items_by_revision_id.setdefault(bom_item.bom_revision_id, []).append(bom_item)

        item_details = []
        total_component_count = 0
        aggregated_components: Dict[str, Dict] = {}
        total_boards_to_produce = 0
        
        for item in items:
            bom_revision = revisions_by_id.get(item.bom_revision_id)
            bom_reference = bom_revision.reference if bom_revision else None
            bom_items = bom_items_by_revision_id.get(item.bom_revision_id, [])
            total_boards_to_produce += item.quantity_to_produce

            unique_component_lines = len(bom_items)
            total_required_components = 0

            for bom_item in bom_items:
                component_value = bom_item.value_harmonized or bom_item.value_raw or "Valeur non renseignee"
                component_type = bom_item.component_type or "Autre"
                footprint = bom_item.footprint_pnp or bom_item.footprint_eagle or "Empreinte non renseignee"
                required_quantity = (bom_item.quantity or 1) * item.quantity_to_produce
                total_required_components += required_quantity
                aggregate_key = f"{component_value}__{footprint}__{component_type}"
                library_match = ComponentLibraryService.match_bom_item(component_library_lookup, bom_item)

                if aggregate_key not in aggregated_components:
                    aggregated_components[aggregate_key] = {
                        "key": aggregate_key,
                        "component_type": component_type,
                        "value": component_value,
                        "footprint": footprint,
                        "component_name": (
                            library_match.mpn or library_match.value
                            if library_match
                            else component_value
                        ),
                        "component_mpn": library_match.mpn if library_match else None,
                        "component_reference": library_match.reference if library_match else None,
                        "supplier_code": library_match.supplier_code if library_match else None,
                        "supplier_name": None,
                        "supplier_link": None,
                        "feeder_type": normalize_component_feeder_type(library_match.feeder_type) if library_match else None,
                        "component_library_id": library_match.id if library_match else None,
                        "lifecycle_status": library_match.lifecycle_status if library_match else None,
                        "qty_per_reel": library_match.qty_per_reel if library_match else None,
                        "manual_placement": False,
                        "quantity": 0,
                        "references": [],
                        "sources": [],
                    }

                aggregated_components[aggregate_key]["quantity"] += required_quantity
                if (
                    library_match
                    and not aggregated_components[aggregate_key]["component_library_id"]
                ):
                    aggregated_components[aggregate_key]["component_name"] = (
                        library_match.mpn or library_match.value or component_value
                    )
                    aggregated_components[aggregate_key]["component_mpn"] = library_match.mpn
                    aggregated_components[aggregate_key]["component_reference"] = library_match.reference
                    aggregated_components[aggregate_key]["supplier_code"] = library_match.supplier_code
                    aggregated_components[aggregate_key]["feeder_type"] = normalize_component_feeder_type(library_match.feeder_type)
                    aggregated_components[aggregate_key]["component_library_id"] = library_match.id
                    aggregated_components[aggregate_key]["lifecycle_status"] = library_match.lifecycle_status
                    aggregated_components[aggregate_key]["qty_per_reel"] = library_match.qty_per_reel
                aggregated_components[aggregate_key]["references"].append(bom_item.reference_item)
                aggregated_components[aggregate_key]["sources"].append(
                    {
                        "bom_revision_id": item.bom_revision_id,
                        "bom_reference": bom_reference.reference if bom_reference else None,
                        "revision": bom_revision.revision if bom_revision else None,
                        "quantity_to_produce": item.quantity_to_produce,
                    }
                )

            total_component_count += total_required_components
            item_details.append({
                "bom_revision_id": item.bom_revision_id,
                "bom_reference": bom_reference.reference if bom_reference else None,
                "revision": bom_revision.revision if bom_revision else None,
                "side": bom_revision.type.value if bom_revision else None,
                "bom_status": bom_revision.status.value if bom_revision else None,
                "quantity_to_produce": item.quantity_to_produce,
                "unique_components": unique_component_lines,
                "total_required_components": total_required_components,
            })

        aggregated_lines = []
        for line in aggregated_components.values():
            references = sorted(set(line["references"]))
            sources = []
            seen_sources = set()
            for source in line["sources"]:
                source_key = (
                    source["bom_revision_id"],
                    source["bom_reference"],
                    source["revision"],
                    source["quantity_to_produce"],
                )
                if source_key in seen_sources:
                    continue
                seen_sources.add(source_key)
                sources.append(source)

            aggregated_lines.append(
                {
                    "key": line["key"],
                    "component_type": line["component_type"],
                    "value": line["value"],
                    "footprint": line["footprint"],
                    "component_name": line["component_name"],
                    "component_mpn": line["component_mpn"],
                    "component_reference": line.get("component_reference"),
                    "supplier_code": line["supplier_code"],
                    "supplier_name": line["supplier_name"],
                    "supplier_link": line["supplier_link"],
                    "feeder_type": line["feeder_type"],
                    "component_library_id": line["component_library_id"],
                    "lifecycle_status": line["lifecycle_status"],
                    "qty_per_reel": line.get("qty_per_reel"),
                    "manual_placement": line["manual_placement"],
                    "quantity": line["quantity"],
                    "references": references,
                    "sources": sources,
                }
            )

        aggregated_lines.sort(
            key=lambda line: (-line["quantity"], line["component_type"], line["value"], line["footprint"])
        )

        component_breakdown = {
            f"{line['component_type']} | {line['value']} | {line['footprint']}": line["quantity"]
            for line in aggregated_lines
        }

        # Attache la quantité reçue (suivi réception) à chaque ligne agrégée.
        receipts = {
            receipt.line_key: receipt.qty_received
            for receipt in db.query(CommandReceipt).filter(CommandReceipt.command_id == command_id).all()
        }
        for line in aggregated_lines:
            line["qty_received"] = receipts.get(line["key"], 0)

        # Attache le stock réel disponible (même calcul que la Revue BOM, ADR 0010/0011)
        # par composant, pour que l'onglet Commande reflète le stock et ne liste que
        # ce qui reste à commander. Import paresseux (évite tout cycle d'import).
        stock_by_component: Dict[int, int] = {}
        if command.production_id:
            try:
                from .production_stock_service import ProductionStockService
                report = ProductionStockService.can_i_produce(db, command.production_id)
                for row in report.get("lines", []):
                    cid = row.get("component_id")
                    if cid is not None:
                        stock_by_component[cid] = int(row.get("disponible") or 0)
            except Exception:  # best-effort : en cas d'échec, stock inconnu (on commande tout)
                stock_by_component = {}
        for line in aggregated_lines:
            cid = line.get("component_library_id")
            line["stock_available"] = stock_by_component.get(cid) if cid in stock_by_component else None

        return {
            "id": command.id,
            "name": command.name,
            "production_id": command.production_id,
            "status": command.status.value,
            "created_at": command.created_at.isoformat(),
            "updated_at": command.updated_at.isoformat(),
            "notes": command.notes,
            "items_count": len(items),
            "total_boards_to_produce": total_boards_to_produce,
            "total_component_items": total_component_count,
            "component_types": len(aggregated_lines),
            "items": item_details,
            "aggregated_components": aggregated_lines,
            "component_breakdown": component_breakdown,
            "aggregation_rule": "value_harmonized + footprint + component_type"
        }

    @staticmethod
    def component_library_ids_for_command(db: Session, command_id: int) -> List[int]:
        """Return the distinct ComponentLibrary ids referenced by a command.

        Reuses the command summary aggregation so the "components of a command"
        definition stays single-sourced. Lines not matched to a library
        component (``component_library_id`` None) are skipped. Returns an empty
        list if the command does not exist.
        """
        try:
            summary = CommandService.get_command_summary(db, command_id)
        except Exception:
            return []
        ids = {
            line.get("component_library_id")
            for line in summary.get("aggregated_components", [])
            if line.get("component_library_id")
        }
        return sorted(ids)

    @staticmethod
    def duplicate_command(
        db: Session,
        source_command_id: int,
        new_name: str
    ) -> Command:
        """
        Duplicate a command (copy all items to new command)
        
        Args:
            db: Database session
            source_command_id: ID of command to copy
            new_name: Name for new command
            
        Returns:
            New Command object
            
        Raises:
            ValueError: If source command not found
        """
        source_command = db.query(Command).filter(Command.id == source_command_id).first()
        
        if not source_command:
            raise ValueError(f"Source command {source_command_id} not found")
        
        # Create new command
        new_command = CommandService.create_command(
            db,
            name=new_name,
            notes=f"Copy of: {source_command.name}",
            production_id=source_command.production_id,
        )
        
        # Copy items
        source_items = db.query(CommandItem).filter(
            CommandItem.command_id == source_command_id
        ).all()
        
        for source_item in source_items:
            CommandService.add_item_to_command(
                db,
                command_id=new_command.id,
                bom_revision_id=source_item.bom_revision_id,
                quantity=source_item.quantity_to_produce
            )
        
        logger.info("Duplicated command %s to new command %s", source_command_id, new_command.id)
        return new_command
