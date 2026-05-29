"""Service layer for user-managed production workspaces."""

from datetime import datetime
from typing import Dict, List, Optional

from sqlalchemy import desc
from sqlalchemy.orm import Session, joinedload

from ..models.bom import BomRevision
from ..models.commands import Command
from ..models.machines import PnpMachine
from ..models.production import Production, ProductionBomRevision


class ProductionWorkspaceService:
    """CRUD helpers for productions that group imported BOM revisions."""

    @staticmethod
    def _normalize_status(status: Optional[str]) -> Optional[Production.StatusEnum]:
        if status is None:
            return None

        normalized = str(status).strip().upper()
        if not normalized:
            return None

        try:
            return Production.StatusEnum(normalized)
        except ValueError as exc:
            raise ValueError(f"Unknown production status '{status}'") from exc

    @staticmethod
    def _serialize_bom_link(link: ProductionBomRevision) -> Dict:
        revision = link.revision
        reference = revision.reference if revision else None
        side = revision.type.value if revision and hasattr(revision.type, "value") else (revision.type if revision else "")
        status = revision.status.value if revision and hasattr(revision.status, "value") else (revision.status if revision else "")
        quantity_to_produce = max(int(link.quantity_to_produce or 1), 1)

        return {
            "bom_reference_id": reference.id if reference else None,
            "bom_revision_id": revision.id if revision else None,
            "reference": reference.reference if reference else "",
            "category": reference.category if reference else None,
            "revision": revision.revision if revision else "",
            "side": side or "",
            "status": status or "",
            "sequence_order": link.sequence_order,
            "quantity_to_produce": quantity_to_produce,
            "file_name": f"{reference.reference}_{side}.txt" if reference and side else "",
            "added_at": link.added_at.isoformat() if link.added_at else None,
        }

    @staticmethod
    def _sort_bom_links(bom_links: Optional[List[ProductionBomRevision]]) -> List[ProductionBomRevision]:
        return sorted(
            list(bom_links or []),
            key=lambda link: (
                link.sequence_order if link.sequence_order is not None else 10**9,
                link.added_at or datetime.min,
                link.id or 0,
            ),
        )

    @classmethod
    def _normalize_bom_link_sequence(cls, production: Production) -> bool:
        changed = False
        for index, link in enumerate(cls._sort_bom_links(production.bom_links), start=1):
            if link.sequence_order != index:
                link.sequence_order = index
                changed = True
        return changed

    @staticmethod
    def _serialize_production(production: Production, include_boms: bool = False) -> Dict:
        bom_links = ProductionWorkspaceService._sort_bom_links(production.bom_links)
        commands = sorted(
            list(production.commands or []),
            key=lambda command: command.updated_at or command.created_at or datetime.min,
            reverse=True,
        )
        total_boards_to_produce_by_key: Dict[str, int] = {}
        for index, link in enumerate(bom_links, start=1):
            revision = link.revision
            reference = revision.reference if revision else None
            board_key = (
                f"{reference.id}:{revision.revision}"
                if reference and revision
                else f"link:{link.id or index}"
            )
            total_boards_to_produce_by_key[board_key] = max(
                total_boards_to_produce_by_key.get(board_key, 0),
                max(int(link.quantity_to_produce or 1), 1),
            )
        total_boards_to_produce = sum(total_boards_to_produce_by_key.values())
        linked_references = sorted({
            link.revision.reference.reference
            for link in bom_links
            if link.revision and link.revision.reference
        })
        latest_command = commands[0] if commands else None

        payload = {
            "id": production.id,
            "name": production.name,
            "machine_id": production.machine_id,
            "machine_name": production.machine.name if production.machine else None,
            "status": production.status.value if hasattr(production.status, "value") else str(production.status),
            "notes": production.notes,
            "erp_context": production.erp_context or {},
            "manufacturing_order_validated_at": (
                production.manufacturing_order_validated_at.isoformat()
                if production.manufacturing_order_validated_at
                else None
            ),
            "created_at": production.created_at.isoformat() if production.created_at else None,
            "updated_at": production.updated_at.isoformat() if production.updated_at else None,
            "bom_count": len(bom_links),
            "total_boards_to_produce": total_boards_to_produce,
            "linked_references": linked_references,
            "command_count": len(commands),
            "latest_command_id": latest_command.id if latest_command else None,
            "latest_command_name": latest_command.name if latest_command else None,
        }

        if include_boms:
            payload["bom_revisions"] = [
                {
                    **ProductionWorkspaceService._serialize_bom_link(link),
                    "sequence_order": link.sequence_order or index,
                }
                for index, link in enumerate(bom_links, start=1)
            ]

        return payload

    @staticmethod
    def _ensure_single_active_production(
        db: Session,
        preferred_production_id: Optional[int] = None,
    ) -> Optional[Production]:
        if preferred_production_id is not None:
            target = db.query(Production).filter(Production.id == preferred_production_id).first()
            if not target:
                raise ValueError(f"Production {preferred_production_id} not found")

            db.query(Production).filter(
                Production.id != preferred_production_id,
                Production.status == Production.StatusEnum.ACTIVE,
            ).update(
                {Production.status: Production.StatusEnum.DRAFT},
                synchronize_session=False,
            )
            target.status = Production.StatusEnum.ACTIVE
            target.updated_at = datetime.utcnow()
            return target

        active_productions = (
            db.query(Production)
            .filter(Production.status == Production.StatusEnum.ACTIVE)
            .order_by(desc(Production.updated_at), desc(Production.created_at), desc(Production.id))
            .all()
        )

        if len(active_productions) > 1:
            keep_active = active_productions[0]
            db.query(Production).filter(
                Production.id != keep_active.id,
                Production.status == Production.StatusEnum.ACTIVE,
            ).update(
                {Production.status: Production.StatusEnum.DRAFT},
                synchronize_session=False,
            )
            keep_active.updated_at = datetime.utcnow()
            return keep_active

        if len(active_productions) == 1:
            return active_productions[0]

        fallback = (
            db.query(Production)
            .order_by(desc(Production.updated_at), desc(Production.created_at), desc(Production.id))
            .first()
        )
        if fallback:
            fallback.status = Production.StatusEnum.ACTIVE
            fallback.updated_at = datetime.utcnow()
        return fallback

    @staticmethod
    def _base_query(db: Session):
        return db.query(Production).options(
            joinedload(Production.bom_links)
            .joinedload(ProductionBomRevision.revision)
            .joinedload(BomRevision.reference),
            joinedload(Production.commands),
            joinedload(Production.machine),
        )

    @staticmethod
    def list_productions(db: Session, search: Optional[str] = None) -> List[Dict]:
        query = ProductionWorkspaceService._base_query(db)
        if search:
            search_term = f"%{search.strip()}%"
            query = query.filter(Production.name.ilike(search_term))

        productions = query.order_by(Production.updated_at.desc(), Production.created_at.desc()).all()
        return [
            ProductionWorkspaceService._serialize_production(production, include_boms=False)
            for production in productions
        ]

    @staticmethod
    def get_production_or_raise(db: Session, production_id: int) -> Production:
        production = ProductionWorkspaceService._base_query(db).filter(Production.id == production_id).first()
        if not production:
            raise ValueError(f"Production {production_id} not found")
        return production

    @staticmethod
    def get_production_detail(db: Session, production_id: int) -> Dict:
        production = ProductionWorkspaceService.get_production_or_raise(db, production_id)
        return ProductionWorkspaceService._serialize_production(production, include_boms=True)

    @staticmethod
    def create_production(
        db: Session,
        name: str,
        machine_id: Optional[int] = None,
        notes: Optional[str] = None,
    ) -> Dict:
        normalized_name = str(name or "").strip()
        if not normalized_name:
            raise ValueError("Production name is required")

        existing = db.query(Production).filter(Production.name == normalized_name).first()
        if existing:
            raise ValueError(f"Production '{normalized_name}' already exists")

        assigned_machine_id = None
        if machine_id is not None:
            machine = db.query(PnpMachine.id).filter(PnpMachine.id == machine_id).first()
            if not machine:
                raise ValueError(f"Machine {machine_id} not found")
            assigned_machine_id = machine_id

        production = Production(
            name=normalized_name,
            machine_id=assigned_machine_id,
            status=Production.StatusEnum.ACTIVE,
            notes=notes.strip() if notes else None,
            manufacturing_order_validated_at=None,
        )
        db.add(production)
        db.flush()
        ProductionWorkspaceService._ensure_single_active_production(db, preferred_production_id=production.id)
        db.commit()
        db.refresh(production)
        return ProductionWorkspaceService.get_production_detail(db, production.id)

    @staticmethod
    def update_production(
        db: Session,
        production_id: int,
        name: Optional[str] = None,
        machine_id: Optional[int] = None,
        machine_id_provided: bool = False,
        status: Optional[str] = None,
        notes: Optional[str] = None,
    ) -> Dict:
        production = ProductionWorkspaceService.get_production_or_raise(db, production_id)

        if name is not None:
            normalized_name = str(name).strip()
            if not normalized_name:
                raise ValueError("Production name cannot be empty")

            duplicate = (
                db.query(Production)
                .filter(Production.name == normalized_name, Production.id != production_id)
                .first()
            )
            if duplicate:
                raise ValueError(f"Production '{normalized_name}' already exists")
            production.name = normalized_name

        if machine_id_provided:
            machine_changed = production.machine_id != machine_id
            if machine_id is None:
                production.machine_id = None
            else:
                machine = db.query(PnpMachine.id).filter(PnpMachine.id == machine_id).first()
                if not machine:
                    raise ValueError(f"Machine {machine_id} not found")
                production.machine_id = machine_id
            if machine_changed:
                production.manufacturing_order_validated_at = None

        normalized_status = ProductionWorkspaceService._normalize_status(status)
        if normalized_status is not None:
            if normalized_status == Production.StatusEnum.ACTIVE:
                ProductionWorkspaceService._ensure_single_active_production(
                    db,
                    preferred_production_id=production.id,
                )
            else:
                production.status = normalized_status

        if notes is not None:
            production.notes = notes.strip() or None

        production.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(production)
        return ProductionWorkspaceService.get_production_detail(db, production.id)

    @staticmethod
    def update_erp_context(
        db: Session,
        production_id: int,
        erp_context: Dict,
    ) -> Dict:
        production = ProductionWorkspaceService.get_production_or_raise(db, production_id)
        production.erp_context = erp_context or {}
        production.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(production)
        return ProductionWorkspaceService.get_production_detail(db, production.id)

    @staticmethod
    def attach_bom_revisions(db: Session, production_id: int, bom_revision_ids: List[int]) -> Dict:
        production = ProductionWorkspaceService.get_production_or_raise(db, production_id)

        normalized_revision_ids = sorted({int(revision_id) for revision_id in bom_revision_ids if revision_id})
        if not normalized_revision_ids:
            raise ValueError("At least one BOM revision must be provided")

        revisions = (
            db.query(BomRevision)
            .options(joinedload(BomRevision.reference))
            .filter(BomRevision.id.in_(normalized_revision_ids))
            .all()
        )
        revisions_by_id = {revision.id: revision for revision in revisions}
        missing_revision_ids = [revision_id for revision_id in normalized_revision_ids if revision_id not in revisions_by_id]
        if missing_revision_ids:
            raise ValueError(
                "Unknown BOM revision(s): " + ", ".join(str(revision_id) for revision_id in missing_revision_ids)
            )

        existing_revision_ids = {link.bom_revision_id for link in production.bom_links}
        next_sequence_order = max(
            (link.sequence_order or index)
            for index, link in enumerate(ProductionWorkspaceService._sort_bom_links(production.bom_links), start=1)
        ) if production.bom_links else 0
        for revision_id in normalized_revision_ids:
            if revision_id in existing_revision_ids:
                continue
            next_sequence_order += 1

            db.add(
                ProductionBomRevision(
                    production_id=production.id,
                    bom_revision_id=revision_id,
                    sequence_order=next_sequence_order,
                    quantity_to_produce=1,
                )
            )

        ProductionWorkspaceService._normalize_bom_link_sequence(production)
        production.manufacturing_order_validated_at = None
        production.updated_at = datetime.utcnow()
        if production.status == Production.StatusEnum.DRAFT:
            ProductionWorkspaceService._ensure_single_active_production(
                db,
                preferred_production_id=production.id,
            )

        db.commit()
        db.refresh(production)
        return ProductionWorkspaceService.get_production_detail(db, production.id)

    @staticmethod
    def detach_bom_revisions(db: Session, production_id: int, bom_revision_ids: List[int]) -> Dict:
        production = ProductionWorkspaceService.get_production_or_raise(db, production_id)

        normalized_revision_ids = sorted({int(revision_id) for revision_id in bom_revision_ids if revision_id})
        if not normalized_revision_ids:
            raise ValueError("At least one BOM revision must be provided")

        db.query(ProductionBomRevision).filter(
            ProductionBomRevision.production_id == production.id,
            ProductionBomRevision.bom_revision_id.in_(normalized_revision_ids),
        ).delete(synchronize_session=False)

        db.flush()
        db.refresh(production)
        ProductionWorkspaceService._normalize_bom_link_sequence(production)
        production.manufacturing_order_validated_at = None
        production.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(production)
        return ProductionWorkspaceService.get_production_detail(db, production.id)

    @staticmethod
    def reorder_bom_revisions(
        db: Session,
        production_id: int,
        bom_revision_ids: List[int],
    ) -> Dict:
        production = ProductionWorkspaceService.get_production_or_raise(db, production_id)

        normalized_revision_ids = [int(revision_id) for revision_id in bom_revision_ids if revision_id]
        if not normalized_revision_ids:
            raise ValueError("At least one BOM revision must be provided")

        current_links = {link.bom_revision_id: link for link in production.bom_links}
        current_revision_ids = set(current_links.keys())
        requested_revision_ids = set(normalized_revision_ids)

        if current_revision_ids != requested_revision_ids:
            missing_ids = sorted(current_revision_ids - requested_revision_ids)
            extra_ids = sorted(requested_revision_ids - current_revision_ids)
            details = []
            if missing_ids:
                details.append("missing: " + ", ".join(str(revision_id) for revision_id in missing_ids))
            if extra_ids:
                details.append("unknown: " + ", ".join(str(revision_id) for revision_id in extra_ids))
            raise ValueError("BOM order must include exactly the linked BOM revisions (" + "; ".join(details) + ")")

        for index, revision_id in enumerate(normalized_revision_ids, start=1):
            current_links[revision_id].sequence_order = index

        production.manufacturing_order_validated_at = None
        production.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(production)
        return ProductionWorkspaceService.get_production_detail(db, production.id)

    @staticmethod
    def update_bom_revision_quantities(
        db: Session,
        production_id: int,
        quantity_items: List[Dict[str, int]],
    ) -> Dict:
        production = ProductionWorkspaceService.get_production_or_raise(db, production_id)

        normalized_items: Dict[int, int] = {}
        for item in quantity_items or []:
            revision_id = int(item.get("bom_revision_id") or 0)
            quantity_to_produce = int(item.get("quantity_to_produce") or 0)
            if revision_id < 1:
                continue
            if quantity_to_produce < 1:
                raise ValueError("Each BOM quantity must be greater than zero")
            normalized_items[revision_id] = quantity_to_produce

        if not normalized_items:
            raise ValueError("At least one BOM quantity must be provided")

        current_links = {link.bom_revision_id: link for link in production.bom_links}
        unknown_revision_ids = sorted(
            revision_id
            for revision_id in normalized_items
            if revision_id not in current_links
        )
        if unknown_revision_ids:
            raise ValueError(
                "Unknown BOM revision(s) for this production: "
                + ", ".join(str(revision_id) for revision_id in unknown_revision_ids)
            )

        for revision_id, quantity_to_produce in normalized_items.items():
            current_links[revision_id].quantity_to_produce = quantity_to_produce

        production.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(production)
        return ProductionWorkspaceService.get_production_detail(db, production.id)

    @staticmethod
    def validate_manufacturing_order(
        db: Session,
        production_id: int,
    ) -> Dict:
        production = ProductionWorkspaceService.get_production_or_raise(db, production_id)
        if not production.bom_links:
            raise ValueError("Aucune BOM n'est liee a cette production.")

        ProductionWorkspaceService._normalize_bom_link_sequence(production)
        production.manufacturing_order_validated_at = datetime.utcnow()
        production.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(production)
        return ProductionWorkspaceService.get_production_detail(db, production.id)

    @staticmethod
    def duplicate_production(db: Session, production_id: int, new_name: str) -> Dict:
        """Duplicate a production workspace with a new name."""
        source = ProductionWorkspaceService.get_production_or_raise(db, production_id)
        if db.query(Production).filter(Production.name == new_name).first():
            raise ValueError(f"Une production avec le nom '{new_name}' existe deja.")

        new_production = Production(
            name=new_name,
            machine_id=source.machine_id,
            status=Production.StatusEnum.DRAFT,
            notes=source.notes,
            erp_context=source.erp_context,
        )
        db.add(new_production)
        db.flush()

        for link in source.bom_links:
            new_link = ProductionBomRevision(
                production_id=new_production.id,
                bom_revision_id=link.bom_revision_id,
                sequence_order=link.sequence_order,
                quantity_to_produce=link.quantity_to_produce,
            )
            db.add(new_link)

        db.commit()
        db.refresh(new_production)
        return ProductionWorkspaceService.get_production_detail(db, new_production.id)
