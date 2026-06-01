"""Shared helper logic for BOM routes.

This module keeps `bom.py` focused on HTTP endpoints by grouping the
serialization, mapping, snapshot and revision-replacement helpers in one place.
"""

from datetime import datetime
import logging
from typing import List, Optional, Tuple

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from ..database import utcnow
from ..models.bom import (
    BomCategory,
    BomItem,
    BomRevision,
    Component,
    FootprintMapping,
)
from ..models.commands import CommandItem
from ..models.machines import PnpCart
from ..models.production import ProductionBomRevision
from ..schemas.bom import BomImportResponse, BomStoredFileSchema, ComponentSchema
from ..services.bom_file_service import BomFileService
from ..services.bom_service import BomService
from ..services.component_type_service import ComponentTypeService
from ..services.component_library_service import ComponentLibraryService
from ..services.machine_footprint_catalog_service import MachineFootprintCatalogService
from ..utils.catalog_cache import footprint_mapping_cache, invalidate_footprint_mappings
from ..utils.feeder_types import normalize_component_feeder_type


bom_service = BomService()
component_library_service = ComponentLibraryService()
bom_file_service = BomFileService()
machine_footprint_catalog_service = MachineFootprintCatalogService()
component_type_service = ComponentTypeService()
logger = logging.getLogger(__name__)


def _enum_value(value):
    """Return the raw enum value when SQLAlchemy returns Enum instances."""
    return getattr(value, "value", value)


def _clean_optional_text(value: Optional[str]) -> Optional[str]:
    """Normalize optional text payload fields."""
    if value is None:
        return None

    cleaned = value.strip()
    return cleaned or None


def _ensure_bom_category(db: Session, category_name: Optional[str]) -> Optional[str]:
    """Ensure a manual BOM category exists in the category catalog."""
    normalized_name = _clean_optional_text(category_name)
    if not normalized_name:
        return None

    category = db.query(BomCategory).filter(BomCategory.name == normalized_name).first()
    if not category:
        category = BomCategory(
            name=normalized_name,
            created_at=utcnow(),
            updated_at=utcnow(),
        )
        db.add(category)
        db.flush()

    return normalized_name


def _normalize_component_package_fields(
    package: Optional[str],
    footprint_pnp: Optional[str],
) -> Tuple[Optional[str], Optional[str]]:
    """Keep package and PnP footprint synchronized for the component library."""
    normalized_package = _clean_optional_text(package)
    normalized_footprint_pnp = _clean_optional_text(footprint_pnp)
    shared_value = normalized_footprint_pnp or normalized_package

    return shared_value, shared_value


def _normalize_component_fixed_feeder_fields(
    db: Session,
    *,
    is_fixed_feeder: Optional[bool],
    fixed_cart_id: Optional[int],
) -> Tuple[bool, Optional[int], Optional[PnpCart]]:
    """Normalize the fixed-feeder + cart combination for the component library."""
    fixed_cart: Optional[PnpCart] = None
    normalized_cart_id = fixed_cart_id
    normalized_flag = bool(is_fixed_feeder)

    if normalized_cart_id is not None:
        fixed_cart = db.query(PnpCart).filter(PnpCart.id == normalized_cart_id).first()
        if not fixed_cart:
            raise HTTPException(status_code=404, detail="Fixed feeder cart not found")
        normalized_flag = True

    if not normalized_flag:
        normalized_cart_id = None
        fixed_cart = None

    return normalized_flag, normalized_cart_id, fixed_cart


def _normalize_component_feeder_type(value: Optional[str]) -> Optional[str]:
    """Normalize component feeder labels to the preferred CL* codes."""
    return normalize_component_feeder_type(value)


def _serialize_component(component: Component) -> ComponentSchema:
    """Serialize a component row with cart metadata for the settings UI."""
    return ComponentSchema(
        id=component.id,
        reference=component.reference,
        value=component.value,
        mpn=component.mpn,
        component_type=component.component_type,
        package=component.package,
        tape_width_mm=component.tape_width_mm,
        pitch_mm=component.pitch_mm,
        supplier_code=component.supplier_code,
        footprint_eagle=component.footprint_eagle,
        footprint_pnp=component.footprint_pnp,
        feeder_type=_normalize_component_feeder_type(component.feeder_type),
        is_fixed_feeder=bool(component.is_fixed_feeder),
        fixed_cart_id=component.fixed_cart_id,
        fixed_cart_name=component.fixed_cart.name if component.fixed_cart else None,
        description=component.description,
        notes=component.notes,
    )


def _apply_machine_footprint_catalog_defaults(
    db: Session,
    component: Component,
    *,
    overwrite: bool = False,
) -> bool:
    """Fill component metadata from the machine-footprint catalog when available."""
    return machine_footprint_catalog_service.apply_defaults_to_component(
        db,
        component,
        overwrite=overwrite,
    )


def _choose_preferred_mapping_value(
    normalized_eagle: str,
    candidate_values: List[Optional[str]],
    inferred_value: Optional[str] = None,
) -> Optional[str]:
    """Resolve conflicting mapping candidates for the same Eagle footprint."""
    ordered_unique_values: List[str] = []
    for value in candidate_values:
        cleaned = _clean_optional_text(value)
        if cleaned and cleaned not in ordered_unique_values:
            ordered_unique_values.append(cleaned)

    if not ordered_unique_values:
        return None

    normalized_inferred = _clean_optional_text(inferred_value)
    if normalized_inferred and normalized_inferred in ordered_unique_values:
        return normalized_inferred

    meaningful_values = [
        value
        for value in ordered_unique_values
        if bom_service.normalize_footprint_name(value) != normalized_eagle
    ]
    if len(meaningful_values) == 1:
        return meaningful_values[0]

    if len(ordered_unique_values) == 1:
        return ordered_unique_values[0]

    return normalized_inferred


def _upsert_footprint_mapping(
    db: Session,
    normalized_eagle: str,
    footprint_pnp: str,
    machine_compatible: Optional[str] = None,
    notes: Optional[str] = None,
) -> FootprintMapping:
    """Create or update a footprint mapping and collapse legacy duplicates."""
    cleaned_pnp = _clean_optional_text(footprint_pnp)
    if not normalized_eagle or not cleaned_pnp:
        raise ValueError("Both Eagle and PnP footprints are required")

    mappings = (
        db.query(FootprintMapping)
        .filter(FootprintMapping.footprint_eagle == normalized_eagle)
        .order_by(FootprintMapping.id.asc())
        .all()
    )

    if mappings:
        mapping = mappings[0]
        mapping.footprint_eagle = normalized_eagle
        mapping.footprint_pnp = cleaned_pnp
        if machine_compatible is not None:
            mapping.machine_compatible = machine_compatible
        if notes is not None:
            mapping.notes = notes

        for duplicate in mappings[1:]:
            db.delete(duplicate)

        invalidate_footprint_mappings()
        return mapping

    mapping = FootprintMapping(
        footprint_eagle=normalized_eagle,
        footprint_pnp=cleaned_pnp,
        machine_compatible=machine_compatible,
        notes=notes,
    )
    db.add(mapping)
    invalidate_footprint_mappings()
    return mapping


def _serialize_bom_item(
    db: Session,
    item: BomItem,
    component_lookup: Optional[dict] = None,
) -> dict:
    """Serialize a BOM item in a frontend-friendly shape."""
    resolved_type = component_type_service.resolve_reference(
        db,
        item.reference_item,
        current_type=item.component_type,
    )
    serialized_item = {
        "id": item.id,
        "reference": item.reference_item,
        "reference_item": item.reference_item,
        "value_raw": item.value_raw,
        "value_harmonized": item.value_harmonized,
        "footprint_eagle": item.footprint_eagle,
        "footprint_pnp": item.footprint_pnp,
        "x": item.x,
        "y": item.y,
        "rotation": item.rotation,
        "type": resolved_type.component_type or item.placement_side,
        "placement_side": item.placement_side,
        "component_type": resolved_type.component_type,
        "component_type_candidates": resolved_type.candidate_types,
        "component_type_requires_confirmation": resolved_type.requires_confirmation,
        "quantity": item.quantity,
        "dnp": item.dnp,
        "notes": item.notes,
    }

    if component_lookup is None:
        return serialized_item

    matched_component = component_library_service.match_item_payload(component_lookup, serialized_item)
    serialized_item["component_library_id"] = matched_component.id if matched_component else None
    serialized_item["component_library_name"] = (
        matched_component.mpn or matched_component.value or matched_component.reference
        if matched_component
        else None
    )
    serialized_item["component_library_pitch_mm"] = (
        matched_component.pitch_mm
        if matched_component
        else None
    )
    serialized_item["component_library_is_fixed_feeder"] = (
        bool(matched_component.is_fixed_feeder)
        if matched_component
        else False
    )
    serialized_item["component_library_fixed_cart_name"] = (
        matched_component.fixed_cart.name
        if matched_component and matched_component.fixed_cart
        else None
    )
    serialized_item["component_library_missing"] = matched_component is None
    serialized_item["proposed_component_name"] = (
        serialized_item["value_harmonized"]
        or serialized_item["value_raw"]
        or serialized_item["reference"]
    )
    return serialized_item


def _get_component_lookup(db: Session, components: Optional[List[Component]] = None) -> dict:
    """Build a component-library lookup, optionally reusing preloaded components."""
    component_rows = (
        components
        if components is not None
        else db.query(Component).options(joinedload(Component.fixed_cart)).all()
    )
    return component_library_service.build_lookup(component_rows)


def _serialize_revision_items(db: Session, items: List[BomItem]) -> List[dict]:
    """Serialize a full revision item list with component-library match metadata."""
    component_lookup = _get_component_lookup(db)
    return [_serialize_bom_item(db, item, component_lookup) for item in items]


def _get_footprint_lookup(db: Session) -> dict:
    """Build a normalized Eagle footprint -> PnP lookup."""
    inferred_lookup = {}
    ambiguous_footprints = set()

    component_rows = (
        db.query(Component.footprint_eagle, Component.footprint_pnp, Component.package)
        .all()
    )
    for footprint_eagle_value, footprint_pnp_value, package_value in component_rows:
        footprint_eagle = bom_service.normalize_footprint_name(footprint_eagle_value)
        footprint_pnp = (footprint_pnp_value or package_value or "").strip()

        if not footprint_eagle or not footprint_pnp:
            continue

        existing = inferred_lookup.get(footprint_eagle)
        if existing and existing != footprint_pnp:
            ambiguous_footprints.add(footprint_eagle)
            inferred_lookup.pop(footprint_eagle, None)
            continue

        if footprint_eagle not in ambiguous_footprints:
            inferred_lookup[footprint_eagle] = footprint_pnp

    explicit_candidates = {}
    # Serve the FootprintMapping table from cache — it only changes when a
    # mapping is explicitly created or updated (each write path calls
    # invalidate_footprint_mappings() so the cache stays consistent).
    cached_mapping_rows = footprint_mapping_cache.get()
    if cached_mapping_rows is None:
        cached_mapping_rows = (
            db.query(FootprintMapping.footprint_eagle, FootprintMapping.footprint_pnp)
            .order_by(FootprintMapping.id.asc())
            .all()
        )
        footprint_mapping_cache.set(cached_mapping_rows)
    mapping_rows = cached_mapping_rows
    for footprint_eagle_value, footprint_pnp_value in mapping_rows:
        normalized_eagle = bom_service.normalize_footprint_name(footprint_eagle_value)
        if not normalized_eagle or not footprint_pnp_value:
            continue

        explicit_candidates.setdefault(normalized_eagle, []).append(footprint_pnp_value)

    resolved_lookup = dict(inferred_lookup)
    for normalized_eagle, candidate_values in explicit_candidates.items():
        preferred_value = _choose_preferred_mapping_value(
            normalized_eagle,
            candidate_values,
            inferred_lookup.get(normalized_eagle),
        )
        if preferred_value:
            resolved_lookup[normalized_eagle] = preferred_value

    return resolved_lookup


def _build_mapping_warnings(items: List[dict]) -> List[str]:
    """Summarize unresolved footprint mappings after review/save."""
    missing = sorted({
        item.get("footprint_eagle")
        for item in items
        if item.get("footprint_eagle") and not item.get("footprint_pnp") and not item.get("dnp")
    })
    return [f"No PnP mapping found for footprint '{footprint}'" for footprint in missing]


def _sync_component_library_footprint(db: Session, normalized_eagle: str, footprint_pnp: str) -> int:
    """Propagate a validated Eagle -> PnP footprint to the component library."""
    updated_count = 0
    candidate_components = (
        db.query(Component)
        .filter(func.trim(func.upper(Component.footprint_eagle)) == normalized_eagle)
        .all()
    )
    for component in candidate_components:
        component.package, component.footprint_pnp = _normalize_component_package_fields(
            component.package,
            footprint_pnp,
        )
        _apply_machine_footprint_catalog_defaults(db, component, overwrite=False)
        updated_count += 1

    return updated_count


def _apply_existing_footprint_mappings(
    db: Session,
    items: List[BomItem],
    footprint_lookup: Optional[dict] = None,
) -> bool:
    """Backfill missing PnP footprints on persisted BOM items from known mappings."""
    if not items:
        return False

    resolved_lookup = footprint_lookup or _get_footprint_lookup(db)
    if not resolved_lookup:
        return False

    changed = False
    for item in items:
        if item.footprint_pnp or not item.footprint_eagle:
            continue

        normalized_eagle = bom_service.normalize_footprint_name(item.footprint_eagle)
        mapped_footprint = resolved_lookup.get(normalized_eagle)
        if not mapped_footprint:
            continue

        item.footprint_pnp = mapped_footprint
        changed = True

    return changed


def _save_revision_snapshot(revision: BomRevision) -> str:
    """Persist the harmonized BOM text snapshot for a revision."""
    if not revision.reference:
        raise HTTPException(status_code=500, detail="BOM reference is missing for snapshot export")

    target_path = bom_file_service.save_revision_snapshot(
        reference=revision.reference.reference,
        revision=revision.revision,
        side=_enum_value(revision.type),
        items=revision.items,
    )
    return str(target_path)


def _build_snapshot_label(
    reference: Optional[str],
    revision: Optional[str],
    side: Optional[str],
) -> str:
    """Create a readable label for snapshot log messages."""
    parts = [value for value in [reference, revision, side] if value]
    return " ".join(parts) or "unknown BOM revision"


def _try_save_revision_snapshot(
    revision: BomRevision,
    warnings: Optional[List[str]] = None,
    action: str = "update",
) -> Optional[str]:
    """Persist a snapshot without breaking an otherwise successful DB operation."""
    try:
        return _save_revision_snapshot(revision)
    except Exception as exc:  # pragma: no cover - exercised via route tests/mocking
        label = _build_snapshot_label(
            revision.reference.reference if revision.reference else None,
            revision.revision,
            _enum_value(revision.type),
        )
        warning = f"Snapshot {action} skipped for {label}: {exc}"
        logger.warning(warning)
        if warnings is not None:
            warnings.append(warning)
        return None


def _try_delete_revision_snapshot(
    reference: str,
    revision: str,
    side: str,
    warnings: Optional[List[str]] = None,
    action: str = "cleanup",
) -> None:
    """Delete a snapshot on disk without failing a successful DB mutation."""
    try:
        bom_file_service.delete_revision_snapshot(reference, revision, side)
    except Exception as exc:  # pragma: no cover - exercised via route tests/mocking
        label = _build_snapshot_label(reference, revision, side)
        warning = f"Snapshot {action} skipped for {label}: {exc}"
        logger.warning(warning)
        if warnings is not None:
            warnings.append(warning)


def _build_revision_session_payload(
    db: Session,
    revision: BomRevision,
    message: Optional[str] = None,
    component_lookup: Optional[dict] = None,
) -> BomImportResponse:
    """Return a revision in the session payload format used by the frontend."""
    persisted_items = db.query(BomItem).filter(BomItem.bom_revision_id == revision.id).all()
    if _apply_existing_footprint_mappings(db, persisted_items):
        db.commit()
        db.refresh(revision)
        _try_save_revision_snapshot(revision, action="refresh")
        persisted_items = db.query(BomItem).filter(BomItem.bom_revision_id == revision.id).all()

    resolved_component_lookup = component_lookup or _get_component_lookup(db)
    serialized_items = [_serialize_bom_item(db, item, resolved_component_lookup) for item in persisted_items]
    reference_name = revision.reference.reference if revision.reference else ""

    return BomImportResponse(
        success=True,
        bom_reference_id=revision.bom_ref_id,
        bom_revision_id=revision.id,
        reference=reference_name,
        revision=revision.revision,
        side=_enum_value(revision.type),
        status=_enum_value(revision.status),
        message=message or f"Loaded {reference_name} {revision.revision} {_enum_value(revision.type)}",
        item_count=len(serialized_items),
        items=serialized_items,
        stats=bom_service.calculate_stats(serialized_items),
        errors=[],
        warnings=_build_mapping_warnings(serialized_items),
    )


def _build_stored_file_entry(revision: BomRevision) -> BomStoredFileSchema:
    """Serialize a stored BOM file entry for the file-browser UI."""
    reference_name = revision.reference.reference if revision.reference else ""
    reference_category = revision.reference.category if revision.reference else None
    file_path = bom_file_service.get_file_path(reference_name, revision.revision, _enum_value(revision.type))

    return BomStoredFileSchema(
        bom_reference_id=revision.bom_ref_id,
        bom_revision_id=revision.id,
        reference=reference_name,
        category=reference_category,
        revision=revision.revision,
        side=_enum_value(revision.type),
        status=_enum_value(revision.status),
        created_at=revision.created_at,
        file_name=file_path.name,
        file_path=str(file_path),
    )


def _get_logical_revisions(
    db: Session,
    bom_reference_id: int,
    revision_name: str,
    side_value,
) -> List[BomRevision]:
    """Return all persisted revisions that represent the same logical BOM file."""
    normalized_side = (
        side_value
        if isinstance(side_value, BomRevision.TypeEnum)
        else BomRevision.TypeEnum(_enum_value(side_value))
    )
    return (
        db.query(BomRevision)
        .filter(
            BomRevision.bom_ref_id == bom_reference_id,
            BomRevision.revision == revision_name,
            BomRevision.type == normalized_side,
        )
        .order_by(BomRevision.created_at.desc(), BomRevision.id.desc())
        .all()
    )


def _merge_duplicate_revision_links(
    db: Session,
    source_revision_ids: List[int],
    target_revision_id: int,
) -> None:
    """Move production and command links from duplicate revisions to a canonical revision."""
    normalized_source_ids = [
        revision_id
        for revision_id in source_revision_ids
        if revision_id and revision_id != target_revision_id
    ]
    if not normalized_source_ids:
        return

    target_production_ids = {
        link.production_id
        for link in db.query(ProductionBomRevision).filter(
            ProductionBomRevision.bom_revision_id == target_revision_id
        ).all()
    }
    source_production_links = (
        db.query(ProductionBomRevision)
        .filter(ProductionBomRevision.bom_revision_id.in_(normalized_source_ids))
        .all()
    )
    for link in source_production_links:
        if link.production_id in target_production_ids:
            db.delete(link)
            continue

        link.bom_revision_id = target_revision_id
        target_production_ids.add(link.production_id)

    target_command_items = {
        item.command_id: item
        for item in db.query(CommandItem).filter(
            CommandItem.bom_revision_id == target_revision_id
        ).all()
    }
    source_command_items = (
        db.query(CommandItem)
        .filter(CommandItem.bom_revision_id.in_(normalized_source_ids))
        .all()
    )
    for command_item in source_command_items:
        existing_target_item = target_command_items.get(command_item.command_id)
        if existing_target_item:
            existing_target_item.quantity_to_produce = (
                (existing_target_item.quantity_to_produce or 0)
                + (command_item.quantity_to_produce or 0)
            )
            db.delete(command_item)
            continue

        command_item.bom_revision_id = target_revision_id
        target_command_items[command_item.command_id] = command_item


def _collapse_duplicate_revisions(
    db: Session,
    canonical_revision: BomRevision,
    duplicate_revisions: List[BomRevision],
) -> None:
    """Delete duplicate logical revisions after moving their dependent links."""
    normalized_duplicates = [
        duplicate
        for duplicate in duplicate_revisions
        if duplicate.id != canonical_revision.id
    ]
    if not normalized_duplicates:
        return

    _merge_duplicate_revision_links(
        db,
        [duplicate.id for duplicate in normalized_duplicates],
        canonical_revision.id,
    )

    for duplicate in normalized_duplicates:
        db.delete(duplicate)


def _replace_revision_items(
    db: Session,
    revision: BomRevision,
    items: List[dict],
    side: str,
) -> List[BomItem]:
    """Replace the persisted content of a logical BOM revision in place."""
    db.query(BomItem).filter(BomItem.bom_revision_id == revision.id).delete(synchronize_session=False)

    persisted_items: List[BomItem] = []
    for item in items:
        db_item = BomItem(
            bom_revision_id=revision.id,
            reference_item=item["reference"],
            value_raw=item.get("value_raw") or None,
            value_harmonized=item.get("value_harmonized") or None,
            footprint_eagle=item.get("footprint_eagle") or None,
            footprint_pnp=item.get("footprint_pnp") or None,
            x=item.get("x"),
            y=item.get("y"),
            rotation=item.get("rotation"),
            placement_side=side,
            component_type=item.get("component_type") or item.get("type") or None,
            quantity=item.get("quantity", 1),
            dnp=bool(item.get("dnp", False)),
            notes=item.get("notes") or None,
        )
        db.add(db_item)
        persisted_items.append(db_item)

    db.flush()
    return persisted_items
