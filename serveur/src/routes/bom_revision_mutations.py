"""Mutation endpoints for BOM revision review and remediation."""

from typing import Dict, List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..models.bom import BomItem, BomRevision, Component
from ..schemas.bom import (
    BomImportResponse,
    BomItemInlineUpdateRequest,
    BomReviewSaveRequest,
    BomReviewSaveResponse,
    MissingComponentResolutionRequest,
    MissingComponentResolutionResponse,
    MissingFootprintResolutionRequest,
)
from ..services.harmony_rules import harmonize_resistor_value
from ..utils.file_parser import infer_component_type
from ..database import get_db
from .bom_support import (
    _apply_machine_footprint_catalog_defaults,
    _build_mapping_warnings,
    _build_revision_session_payload,
    _clean_optional_text,
    _enum_value,
    _get_component_lookup,
    _normalize_component_package_fields,
    _serialize_bom_item,
    _serialize_component,
    _sync_component_library_footprint,
    _try_delete_revision_snapshot,
    _try_save_revision_snapshot,
    _upsert_footprint_mapping,
    bom_service,
    component_library_service,
    component_type_service,
)

router = APIRouter(tags=["bom"])


def _normalize_edited_resistor_value(reference: str, value):
    """Ré-harmonise une valeur éditée à la main quand le composant est une
    résistance (préfixe de désignateur `R`) : décode la notation RKM
    (49K9 -> 49.9K, 4R7 -> 4.7R) et met l'unité en majuscule. Les autres types
    sont laissés tels quels. Idempotent (une valeur déjà normalisée ne bouge pas).
    """
    if not value:
        return value
    if infer_component_type(reference or "") == "R":
        return harmonize_resistor_value(value)
    return value


def _get_revision_or_404(db: Session, bom_id: int, revision_id: int) -> BomRevision:
    revision = db.query(BomRevision).filter(
        BomRevision.id == revision_id,
        BomRevision.bom_ref_id == bom_id,
    ).first()
    if not revision:
        raise HTTPException(status_code=404, detail="Revision not found")
    return revision


def _serialize_revision_items(db: Session, revision_id: int) -> List[Dict]:
    persisted_items = db.query(BomItem).filter(BomItem.bom_revision_id == revision_id).all()
    component_lookup = _get_component_lookup(db)
    return [_serialize_bom_item(db, item, component_lookup) for item in persisted_items]


@router.put("/{bom_id}/revisions/{revision_id}/review", response_model=BomReviewSaveResponse)
def save_bom_review(
    bom_id: int,
    revision_id: int,
    payload: BomReviewSaveRequest,
    db: Session = Depends(get_db),
):
    """Persist reviewed BOM edits and optionally store reusable footprint mappings."""
    revision = _get_revision_or_404(db, bom_id, revision_id)

    db_items = {
        item.id: item
        for item in db.query(BomItem).filter(BomItem.bom_revision_id == revision_id).all()
    }
    saved_mapping_keys = set()
    footprint_mapping_updates = {}

    for item_update in payload.items:
        db_item = db_items.get(item_update.id)
        if not db_item:
            raise HTTPException(
                status_code=404,
                detail=f"BOM item '{item_update.id}' not found in revision",
            )

        requested_component_type = (
            component_type_service.normalize_for_storage(item_update.component_type)
            if item_update.component_type is not None
            else component_type_service.resolve_reference(
                db,
                db_item.reference_item,
                current_type=db_item.component_type,
            ).component_type
        )
        if payload.mark_as_active:
            is_valid, error_message = component_type_service.validate_confirmation_for_activation(
                db,
                reference=db_item.reference_item,
                current_type=db_item.component_type,
                requested_type=requested_component_type,
                confirmed=bool(item_update.component_type_confirmed),
            )
            if not is_valid:
                raise HTTPException(status_code=422, detail=error_message)

        if item_update.value_harmonized is not None:
            cleaned_value = item_update.value_harmonized.strip() or None
            db_item.value_harmonized = _normalize_edited_resistor_value(
                db_item.reference_item, cleaned_value
            )
        if item_update.footprint_pnp is not None:
            db_item.footprint_pnp = item_update.footprint_pnp.strip() or None
        db_item.component_type = requested_component_type
        if item_update.notes is not None:
            db_item.notes = item_update.notes.strip() or None
        if item_update.dnp is not None:
            db_item.dnp = item_update.dnp

        if payload.create_mappings and not db_item.dnp and db_item.footprint_eagle and db_item.footprint_pnp:
            normalized_eagle = bom_service.normalize_footprint_name(db_item.footprint_eagle)
            cleaned_pnp = _clean_optional_text(db_item.footprint_pnp)
            existing_footprint = footprint_mapping_updates.get(normalized_eagle)
            if existing_footprint and existing_footprint != cleaned_pnp:
                raise HTTPException(
                    status_code=422,
                    detail=(
                        f"Conflicting PnP footprints provided for Eagle footprint "
                        f"'{normalized_eagle}' in the same review"
                    ),
                )
            footprint_mapping_updates[normalized_eagle] = cleaned_pnp

    if payload.create_mappings and footprint_mapping_updates:
        for db_item in db_items.values():
            normalized_eagle = bom_service.normalize_footprint_name(db_item.footprint_eagle)
            synced_footprint = footprint_mapping_updates.get(normalized_eagle)
            if synced_footprint:
                db_item.footprint_pnp = synced_footprint

        for normalized_eagle, footprint_pnp in footprint_mapping_updates.items():
            _upsert_footprint_mapping(db, normalized_eagle, footprint_pnp)
            saved_mapping_keys.add(normalized_eagle)
            _sync_component_library_footprint(db, normalized_eagle, footprint_pnp)

    if payload.mark_as_active:
        revision.status = BomRevision.StatusEnum.ACTIVE

    serialized_items = _serialize_revision_items(db, revision_id)
    db.commit()
    db.refresh(revision)
    response_warnings = _build_mapping_warnings(serialized_items)
    _try_save_revision_snapshot(revision, warnings=response_warnings, action="review")
    return BomReviewSaveResponse(
        success=True,
        bom_reference_id=bom_id,
        bom_revision_id=revision_id,
        revision_status=_enum_value(revision.status),
        saved_mapping_count=len(saved_mapping_keys),
        message=f"Saved review for {len(serialized_items)} BOM items",
        item_count=len(serialized_items),
        items=serialized_items,
        stats=bom_service.calculate_stats(serialized_items),
        errors=[],
        warnings=response_warnings,
    )


@router.post(
    "/{bom_id}/revisions/{revision_id}/missing-components/resolve",
    response_model=MissingComponentResolutionResponse,
)
def resolve_missing_components(
    bom_id: int,
    revision_id: int,
    payload: MissingComponentResolutionRequest,
    db: Session = Depends(get_db),
):
    """Register unknown components in the library or remove them from the current BOM."""
    revision = _get_revision_or_404(db, bom_id, revision_id)

    db_items = db.query(BomItem).filter(
        BomItem.bom_revision_id == revision_id,
        BomItem.id.in_(payload.item_ids),
    ).all()
    if len(db_items) != len(set(payload.item_ids)):
        raise HTTPException(status_code=404, detail="One or more BOM items were not found in this revision")

    if payload.action == "delete":
        for db_item in db_items:
            db.delete(db_item)

        db.commit()
        db.refresh(revision)
        remaining_items = db.query(BomItem).filter(BomItem.bom_revision_id == revision_id).all()
        if remaining_items:
            _try_save_revision_snapshot(revision, action="missing component delete")
        else:
            _try_delete_revision_snapshot(
                revision.reference.reference if revision.reference else str(bom_id),
                revision.revision,
                _enum_value(revision.type),
                action="missing component delete",
            )

        serialized_items = _serialize_revision_items(db, revision_id)
        return MissingComponentResolutionResponse(
            success=True,
            bom_reference_id=bom_id,
            bom_revision_id=revision_id,
            reference=revision.reference.reference if revision.reference else None,
            revision=revision.revision,
            side=_enum_value(revision.type),
            status=_enum_value(revision.status),
            action="delete",
            message=f"Removed {len(db_items)} BOM item(s) from the current revision",
            item_count=len(serialized_items),
            items=serialized_items,
            stats=bom_service.calculate_stats(serialized_items),
            errors=[],
            warnings=_build_mapping_warnings(serialized_items),
        )

    representative_item = db_items[0]
    default_component_name = (
        payload.component_name
        or representative_item.value_harmonized
        or representative_item.value_raw
        or representative_item.reference_item
    )
    component_name = default_component_name.strip() if default_component_name else ""
    if not component_name:
        raise HTTPException(status_code=422, detail="Component name cannot be empty")

    current_lookup = _get_component_lookup(db)
    matched_component = component_library_service.match_bom_item(current_lookup, representative_item)

    if not matched_component:
        component_value = representative_item.value_harmonized or representative_item.value_raw
        component_footprint_eagle = representative_item.footprint_eagle or representative_item.footprint_pnp
        generated_reference = component_library_service.build_component_reference(
            value=component_value,
            mpn=component_name,
            footprint_eagle=component_footprint_eagle,
        )

        matched_component = db.query(Component).filter(Component.reference == generated_reference).first()
        if not matched_component:
            matched_component = Component(reference=generated_reference)
            db.add(matched_component)

        matched_component.value = component_name
        matched_component.mpn = None
        matched_component.component_type = component_type_service.resolve_reference(
            db,
            representative_item.reference_item,
            current_type=representative_item.component_type,
        ).component_type
        matched_component.description = component_value
        matched_component.footprint_eagle = representative_item.footprint_eagle
        matched_component.package, matched_component.footprint_pnp = _normalize_component_package_fields(
            representative_item.footprint_pnp,
            representative_item.footprint_pnp,
        )
        matched_component.notes = (
            f"Created from BOM {revision.reference.reference if revision.reference else bom_id} "
            f"{revision.revision} item {representative_item.reference_item}"
        )
        _apply_machine_footprint_catalog_defaults(db, matched_component, overwrite=False)

        db.commit()
        db.refresh(matched_component)
        db.refresh(revision)

    serialized_items = _serialize_revision_items(db, revision_id)
    return MissingComponentResolutionResponse(
        success=True,
        bom_reference_id=bom_id,
        bom_revision_id=revision_id,
        reference=revision.reference.reference if revision.reference else None,
        revision=revision.revision,
        side=_enum_value(revision.type),
        status=_enum_value(revision.status),
        action="register",
        message=f"Registered component '{component_name}' in the component library",
        item_count=len(serialized_items),
        items=serialized_items,
        stats=bom_service.calculate_stats(serialized_items),
        errors=[],
        warnings=_build_mapping_warnings(serialized_items),
        component=_serialize_component(matched_component),
    )


@router.post(
    "/{bom_id}/revisions/{revision_id}/missing-footprints/resolve",
    response_model=BomImportResponse,
)
def resolve_missing_footprints(
    bom_id: int,
    revision_id: int,
    payload: MissingFootprintResolutionRequest,
    db: Session = Depends(get_db),
):
    """Register a missing Eagle -> PnP mapping and apply it to selected BOM items."""
    revision = _get_revision_or_404(db, bom_id, revision_id)

    footprint_pnp = payload.footprint_pnp.strip()
    if not footprint_pnp:
        raise HTTPException(status_code=422, detail="PnP footprint cannot be empty")

    db_items = db.query(BomItem).filter(
        BomItem.bom_revision_id == revision_id,
        BomItem.id.in_(payload.item_ids),
    ).all()
    if len(db_items) != len(set(payload.item_ids)):
        raise HTTPException(status_code=404, detail="One or more BOM items were not found in this revision")

    normalized_footprints = {
        bom_service.normalize_footprint_name(item.footprint_eagle)
        for item in db_items
        if item.footprint_eagle
    }
    if len(normalized_footprints) != 1:
        raise HTTPException(status_code=422, detail="Selected items must share the same Eagle footprint")

    normalized_eagle = normalized_footprints.pop()
    _upsert_footprint_mapping(db, normalized_eagle, footprint_pnp)
    _sync_component_library_footprint(db, normalized_eagle, footprint_pnp)

    for db_item in db_items:
        db_item.footprint_pnp = footprint_pnp

    db.commit()
    db.refresh(revision)
    _try_save_revision_snapshot(revision, action="missing footprint resolve")

    serialized_items = _serialize_revision_items(db, revision_id)
    return BomImportResponse(
        success=True,
        bom_reference_id=bom_id,
        bom_revision_id=revision_id,
        reference=revision.reference.reference if revision.reference else None,
        revision=revision.revision,
        side=_enum_value(revision.type),
        status=_enum_value(revision.status),
        message=f"Saved PnP mapping '{footprint_pnp}' for footprint '{normalized_eagle}'",
        item_count=len(serialized_items),
        items=serialized_items,
        stats=bom_service.calculate_stats(serialized_items),
        errors=[],
        warnings=_build_mapping_warnings(serialized_items),
    )


@router.patch(
    "/{bom_id}/revisions/{revision_id}/items/{item_id}",
    response_model=BomImportResponse,
)
def update_bom_item_inline(
    bom_id: int,
    revision_id: int,
    item_id: int,
    payload: BomItemInlineUpdateRequest,
    db: Session = Depends(get_db),
):
    """Update a BOM item inline during import/review and optionally save a mapping."""
    revision = _get_revision_or_404(db, bom_id, revision_id)

    db_item = db.query(BomItem).filter(
        BomItem.id == item_id,
        BomItem.bom_revision_id == revision_id,
    ).first()
    if not db_item:
        raise HTTPException(status_code=404, detail="BOM item not found")

    payload_fields = getattr(payload, "__fields_set__", set())

    if "value_harmonized" in payload_fields:
        db_item.value_harmonized = _normalize_edited_resistor_value(
            db_item.reference_item, _clean_optional_text(payload.value_harmonized)
        )

    if "footprint_pnp" in payload_fields:
        updated_footprint = _clean_optional_text(payload.footprint_pnp)
        db_item.footprint_pnp = updated_footprint

        if payload.create_mapping and db_item.footprint_eagle and updated_footprint:
            normalized_eagle = bom_service.normalize_footprint_name(db_item.footprint_eagle)
            _upsert_footprint_mapping(db, normalized_eagle, updated_footprint)
            _sync_component_library_footprint(db, normalized_eagle, updated_footprint)

            sibling_items = db.query(BomItem).filter(BomItem.bom_revision_id == revision_id).all()
            for sibling in sibling_items:
                if bom_service.normalize_footprint_name(sibling.footprint_eagle) == normalized_eagle:
                    sibling.footprint_pnp = updated_footprint

    db.commit()
    db.refresh(revision)
    _try_save_revision_snapshot(revision, action="inline update")

    return _build_revision_session_payload(
        db,
        revision,
        component_lookup=_get_component_lookup(db),
        message=(
            f"Footprint PnP mis a jour pour {db_item.reference_item}"
            if "footprint_pnp" in payload_fields
            else f"Valeur harmonisee mise a jour pour {db_item.reference_item}"
        ),
    )
