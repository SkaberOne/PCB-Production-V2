"""Component and footprint mapping endpoints for the BOM API."""

import json
import os
import tempfile
from datetime import datetime
from io import BytesIO
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import asc, desc, func, or_
from sqlalchemy.orm import Session, joinedload

from ..database import utcnow
from ..models.bom import Component, ComponentTypeRule, FootprintMapping, MachineFootprintRule
from ..schemas.bom import (
    ComponentLibraryImportResponse,
    ComponentTypeRefreshResponse,
    ComponentTypeRuleImportResponse,
    ComponentTypeRuleMutationResponse,
    ComponentTypeRuleReorderRequest,
    ComponentTypeRuleReplaceRequest,
    ComponentTypeRuleSchema,
    ComponentTypeRuleUpsertRequest,
    ComponentSchema,
    FootprintMappingCreateSchema,
    FootprintMappingSchema,
    MachineFootprintCatalogImportResponse,
    MachineFootprintCatalogSchema,
)
from .bom import get_db
from .bom_support import (
    _apply_machine_footprint_catalog_defaults,
    _clean_optional_text,
    _normalize_component_feeder_type,
    _normalize_component_fixed_feeder_fields,
    _normalize_component_package_fields,
    _serialize_component,
    _upsert_footprint_mapping,
    bom_service,
    component_library_service,
    component_type_service,
    machine_footprint_catalog_service,
)
from ..utils.catalog_cache import invalidate_component_type_rules, invalidate_footprint_mappings

router = APIRouter(tags=["bom"])


def _serialize_component_type_rule(rule: ComponentTypeRule) -> ComponentTypeRuleSchema:
    return ComponentTypeRuleSchema(
        id=rule.id,
        reference_prefix=rule.reference_prefix,
        mapped_type=rule.mapped_type,
        requires_confirmation=bool(rule.requires_confirmation),
        priority=int(rule.priority or 100),
        enabled=bool(rule.enabled),
        description=rule.description,
    )


def _next_duplicate_prefix(db: Session, base_prefix: str) -> str:
    normalized_prefix = component_type_service.normalize_reference(base_prefix)
    candidate = f"{normalized_prefix}_COPY"
    suffix = 2

    while db.query(ComponentTypeRule).filter(ComponentTypeRule.reference_prefix == candidate).first():
        candidate = f"{normalized_prefix}_COPY_{suffix}"
        suffix += 1

    return candidate


@router.get("/components", response_model=List[ComponentSchema])
def list_components(
    response: Response,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=10000),
    search: Optional[str] = Query(None, description="Search across the main component library fields"),
    reference: Optional[str] = Query(None, description="Filter by reference"),
    value: Optional[str] = Query(None, description="Filter by value"),
    package: Optional[str] = Query(None, description="Filter by package"),
    mpn: Optional[str] = Query(None, description="Filter by manufacturer part number"),
    supplier_code: Optional[str] = Query(None, description="Filter by supplier code"),
    footprint_eagle: Optional[str] = Query(None, description="Filter by Eagle footprint"),
    footprint_pnp: Optional[str] = Query(None, description="Filter by machine footprint"),
    feeder_type: Optional[str] = Query(None, description="Filter by feeder type"),
    created_from_bom: Optional[bool] = Query(None, description="Filter components created from BOM remediation"),
    is_fixed_feeder: Optional[bool] = Query(None, description="Filter by fixed-feeder status"),
    sort_by: str = Query("value", description="Sort column for the component table"),
    sort_dir: str = Query("asc", description="Sort direction: asc or desc"),
    db: Session = Depends(get_db),
):
    """Query the component master data."""
    query = db.query(Component).options(joinedload(Component.fixed_cart))

    if search and search.strip():
        token = f"%{search.strip()}%"
        query = query.filter(
            or_(
                Component.reference.ilike(token),
                Component.value.ilike(token),
                Component.mpn.ilike(token),
                Component.component_type.ilike(token),
                Component.package.ilike(token),
                Component.supplier_code.ilike(token),
                Component.footprint_eagle.ilike(token),
                Component.footprint_pnp.ilike(token),
                Component.feeder_type.ilike(token),
                Component.description.ilike(token),
                Component.notes.ilike(token),
            )
        )
    if reference and reference.strip():
        query = query.filter(Component.reference.ilike(f"%{reference.strip()}%"))
    if value and value.strip():
        query = query.filter(Component.value.ilike(f"%{value.strip()}%"))
    if package and package.strip():
        query = query.filter(Component.package.ilike(f"%{package.strip()}%"))
    if mpn and mpn.strip():
        query = query.filter(Component.mpn.ilike(f"%{mpn.strip()}%"))
    if supplier_code and supplier_code.strip():
        query = query.filter(Component.supplier_code.ilike(f"%{supplier_code.strip()}%"))
    if footprint_eagle and footprint_eagle.strip():
        query = query.filter(Component.footprint_eagle.ilike(f"%{footprint_eagle.strip()}%"))
    if footprint_pnp and footprint_pnp.strip():
        query = query.filter(Component.footprint_pnp.ilike(f"%{footprint_pnp.strip()}%"))
    if feeder_type and feeder_type.strip():
        normalized_feeder_type = _normalize_component_feeder_type(feeder_type)
        raw_feeder_token = feeder_type.strip()
        if normalized_feeder_type and normalized_feeder_type != raw_feeder_token:
            query = query.filter(
                or_(
                    Component.feeder_type.ilike(f"%{raw_feeder_token}%"),
                    Component.feeder_type == normalized_feeder_type,
                )
            )
        else:
            query = query.filter(Component.feeder_type.ilike(f"%{raw_feeder_token}%"))
    if created_from_bom is True:
        query = query.filter(Component.notes.ilike("Created from BOM%"))
    elif created_from_bom is False:
        query = query.filter(or_(Component.notes.is_(None), ~Component.notes.ilike("Created from BOM%")))
    if is_fixed_feeder is True:
        query = query.filter(Component.is_fixed_feeder.is_(True))
    elif is_fixed_feeder is False:
        query = query.filter(or_(Component.is_fixed_feeder.is_(False), Component.is_fixed_feeder.is_(None)))

    sort_columns = {
        "id": Component.id,
        "reference": Component.reference,
        "value": Component.value,
        "mpn": Component.mpn,
        "component_type": Component.component_type,
        "package": Component.package,
        "supplier_code": Component.supplier_code,
        "footprint_eagle": Component.footprint_eagle,
        "footprint_pnp": Component.footprint_pnp,
        "feeder_type": Component.feeder_type,
    }
    selected_sort_column = sort_columns.get(sort_by, Component.value)
    selected_sort_direction = desc if str(sort_dir).lower() == "desc" else asc
    sort_expression = func.lower(func.coalesce(selected_sort_column, ""))
    reference_sort_expression = func.lower(func.coalesce(Component.reference, ""))

    response.headers["X-Total-Count"] = str(query.order_by(None).count())

    return [
        _serialize_component(component)
        for component in query.order_by(
            selected_sort_direction(sort_expression),
            asc(reference_sort_expression),
            asc(Component.id),
        ).offset(skip).limit(limit).all()
    ]


@router.post("/components", response_model=ComponentSchema)
def create_component(component: ComponentSchema, db: Session = Depends(get_db)):
    """Add a new component to the master database."""
    existing = db.query(Component).filter(Component.reference == component.reference).first()
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"Component with reference '{component.reference}' already exists",
        )

    normalized_package, normalized_footprint_pnp = _normalize_component_package_fields(
        component.package,
        component.footprint_pnp,
    )
    is_fixed_feeder, fixed_cart_id, _ = _normalize_component_fixed_feeder_fields(
        db,
        is_fixed_feeder=component.is_fixed_feeder,
        fixed_cart_id=component.fixed_cart_id,
    )

    db_component = Component(
        reference=component.reference.strip(),
        value=_clean_optional_text(component.value),
        mpn=_clean_optional_text(component.mpn),
        component_type=component_type_service.normalize_for_storage(component.component_type),
        package=normalized_package,
        tape_width_mm=component.tape_width_mm,
        pitch_mm=component.pitch_mm,
        supplier_code=_clean_optional_text(component.supplier_code),
        footprint_eagle=_clean_optional_text(component.footprint_eagle),
        footprint_pnp=normalized_footprint_pnp,
        feeder_type=_normalize_component_feeder_type(component.feeder_type),
        is_fixed_feeder=is_fixed_feeder,
        fixed_cart_id=fixed_cart_id,
        description=_clean_optional_text(component.description),
        notes=_clean_optional_text(component.notes),
    )
    _apply_machine_footprint_catalog_defaults(db, db_component, overwrite=False)
    db.add(db_component)
    if db_component.footprint_eagle and normalized_footprint_pnp:
        _upsert_footprint_mapping(
            db,
            bom_service.normalize_footprint_name(db_component.footprint_eagle),
            normalized_footprint_pnp,
        )
    db.commit()
    db.refresh(db_component)
    return _serialize_component(db_component)


@router.put("/components/{component_id}", response_model=ComponentSchema)
def update_component(component_id: int, component: ComponentSchema, db: Session = Depends(get_db)):
    """Update an existing component in the master database."""
    db_component = db.query(Component).filter(Component.id == component_id).first()
    if not db_component:
        raise HTTPException(status_code=404, detail="Component not found")

    normalized_reference = component.reference.strip()
    duplicate = db.query(Component).filter(
        Component.id != component_id,
        Component.reference == normalized_reference,
    ).first()
    if duplicate:
        raise HTTPException(
            status_code=409,
            detail=f"Component with reference '{normalized_reference}' already exists",
        )

    normalized_package, normalized_footprint_pnp = _normalize_component_package_fields(
        component.package,
        component.footprint_pnp,
    )
    requested_is_fixed_feeder = (
        component.is_fixed_feeder
        if "is_fixed_feeder" in getattr(component, "__fields_set__", set())
        else db_component.is_fixed_feeder
    )
    requested_fixed_cart_id = (
        component.fixed_cart_id
        if "fixed_cart_id" in getattr(component, "__fields_set__", set())
        else db_component.fixed_cart_id
    )
    is_fixed_feeder, fixed_cart_id, _ = _normalize_component_fixed_feeder_fields(
        db,
        is_fixed_feeder=requested_is_fixed_feeder,
        fixed_cart_id=requested_fixed_cart_id,
    )

    db_component.reference = normalized_reference
    db_component.value = _clean_optional_text(component.value)
    db_component.mpn = _clean_optional_text(component.mpn)
    db_component.component_type = component_type_service.normalize_for_storage(component.component_type)
    db_component.package = normalized_package
    db_component.tape_width_mm = component.tape_width_mm
    db_component.pitch_mm = component.pitch_mm
    db_component.supplier_code = _clean_optional_text(component.supplier_code)
    db_component.footprint_eagle = _clean_optional_text(component.footprint_eagle)
    db_component.footprint_pnp = normalized_footprint_pnp
    db_component.feeder_type = _normalize_component_feeder_type(component.feeder_type)
    db_component.is_fixed_feeder = is_fixed_feeder
    db_component.fixed_cart_id = fixed_cart_id
    db_component.description = _clean_optional_text(component.description)
    db_component.notes = _clean_optional_text(component.notes)
    _apply_machine_footprint_catalog_defaults(db, db_component, overwrite=False)
    if db_component.footprint_eagle and normalized_footprint_pnp:
        _upsert_footprint_mapping(
            db,
            bom_service.normalize_footprint_name(db_component.footprint_eagle),
            normalized_footprint_pnp,
        )
    db.commit()
    db.refresh(db_component)
    return _serialize_component(db_component)


@router.post("/components/types/refresh", response_model=ComponentTypeRefreshResponse)
def refresh_component_types(db: Session = Depends(get_db)):
    """Recalculate component families from BOM references for legacy data."""
    result = component_type_service.reconcile_database(
        db,
        apply_defaults=_apply_machine_footprint_catalog_defaults,
    )
    return ComponentTypeRefreshResponse(
        success=True,
        message=(
            f"Rattrapage terminé : {result.updated_component_count} composant(s) et "
            f"{result.updated_bom_item_count} ligne(s) BOM mis à jour."
        ),
        updated_component_count=result.updated_component_count,
        updated_bom_item_count=result.updated_bom_item_count,
        inferred_type_count=result.inferred_type_count,
        ambiguous_component_count=result.ambiguous_component_count,
        manual_preserved_count=result.manual_preserved_count,
        skipped_count=result.skipped_count,
        ambiguous_component_ids=result.ambiguous_component_ids,
    )


@router.get("/component-type-rules", response_model=List[ComponentTypeRuleSchema])
def list_component_type_rules(
    search: Optional[str] = Query(None, description="Filter by prefix, mapped type, or description"),
    db: Session = Depends(get_db),
):
    """List editable component-type inference rules."""
    component_type_service.ensure_default_rules(db)
    query = db.query(ComponentTypeRule)

    if search and search.strip():
        token = f"%{search.strip()}%"
        query = query.filter(
            or_(
                ComponentTypeRule.reference_prefix.ilike(token),
                ComponentTypeRule.mapped_type.ilike(token),
                ComponentTypeRule.description.ilike(token),
            )
        )

    rules = query.order_by(
        asc(ComponentTypeRule.priority),
        desc(func.length(ComponentTypeRule.reference_prefix)),
        asc(func.lower(func.coalesce(ComponentTypeRule.reference_prefix, ""))),
        asc(ComponentTypeRule.id),
    ).all()
    return [_serialize_component_type_rule(rule) for rule in rules]


@router.post("/component-type-rules", response_model=ComponentTypeRuleSchema)
def create_component_type_rule(
    payload: ComponentTypeRuleUpsertRequest,
    db: Session = Depends(get_db),
):
    """Create a new component-type inference rule."""
    component_type_service.ensure_default_rules(db)
    normalized_prefix = component_type_service.normalize_reference(payload.reference_prefix)
    existing = db.query(ComponentTypeRule).filter(ComponentTypeRule.reference_prefix == normalized_prefix).first()
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"Rule with prefix '{normalized_prefix}' already exists",
        )

    rule = ComponentTypeRule(
        reference_prefix=normalized_prefix,
        mapped_type=component_type_service.normalize_for_storage(payload.mapped_type) or "UNDEFINED",
        requires_confirmation=bool(payload.requires_confirmation),
        priority=int(payload.priority),
        enabled=bool(payload.enabled),
        description=_clean_optional_text(payload.description),
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    invalidate_component_type_rules()
    return _serialize_component_type_rule(rule)


@router.post("/component-type-rules/reorder", response_model=ComponentTypeRuleMutationResponse)
def reorder_component_type_rules(
    payload: ComponentTypeRuleReorderRequest,
    db: Session = Depends(get_db),
):
    """Persist a manual ordering for component-type inference rules."""
    component_type_service.ensure_default_rules(db)
    rules = (
        db.query(ComponentTypeRule)
        .order_by(
            asc(ComponentTypeRule.priority),
            desc(func.length(ComponentTypeRule.reference_prefix)),
            asc(func.lower(func.coalesce(ComponentTypeRule.reference_prefix, ""))),
            asc(ComponentTypeRule.id),
        )
        .all()
    )
    existing_ids = [int(rule.id) for rule in rules if rule.id is not None]
    ordered_rule_ids = [int(rule_id) for rule_id in payload.ordered_rule_ids]

    if not ordered_rule_ids:
        raise HTTPException(status_code=422, detail="ordered_rule_ids cannot be empty")

    if len(set(ordered_rule_ids)) != len(ordered_rule_ids):
        raise HTTPException(status_code=422, detail="ordered_rule_ids contains duplicates")

    if set(ordered_rule_ids) != set(existing_ids):
        raise HTTPException(status_code=422, detail="ordered_rule_ids must include every existing rule exactly once")

    rules_by_id = {int(rule.id): rule for rule in rules if rule.id is not None}
    for index, rule_id in enumerate(ordered_rule_ids):
        rules_by_id[rule_id].priority = (index + 1) * 10

    db.commit()
    invalidate_component_type_rules()
    return ComponentTypeRuleMutationResponse(
        success=True,
        message="Component type rules reordered",
        rule_count=len(existing_ids),
    )


@router.post("/component-type-rules/replace", response_model=ComponentTypeRuleMutationResponse)
def replace_component_type_rules(
    payload: ComponentTypeRuleReplaceRequest,
    db: Session = Depends(get_db),
):
    """Replace the entire editable component-type rule catalog."""
    if not payload.rules:
        raise HTTPException(status_code=422, detail="rules cannot be empty")

    normalized_prefixes = []
    prepared_rules = []
    for index, raw_rule in enumerate(payload.rules, start=1):
        normalized_prefix = component_type_service.normalize_reference(raw_rule.reference_prefix)
        if not normalized_prefix:
            raise HTTPException(status_code=422, detail=f"Rule #{index} is missing reference_prefix")
        if normalized_prefix in normalized_prefixes:
            raise HTTPException(status_code=422, detail=f"Duplicate prefix '{normalized_prefix}' in replacement payload")

        normalized_prefixes.append(normalized_prefix)
        prepared_rules.append(
            ComponentTypeRule(
                reference_prefix=normalized_prefix,
                mapped_type=component_type_service.normalize_for_storage(raw_rule.mapped_type) or "UNDEFINED",
                requires_confirmation=bool(raw_rule.requires_confirmation),
                priority=int(raw_rule.priority),
                enabled=bool(raw_rule.enabled),
                description=_clean_optional_text(raw_rule.description),
            )
        )

    db.query(ComponentTypeRule).delete(synchronize_session=False)
    for rule in prepared_rules:
        db.add(rule)
    db.commit()
    invalidate_component_type_rules()

    return ComponentTypeRuleMutationResponse(
        success=True,
        message="Component type rules restored",
        rule_count=len(prepared_rules),
    )


@router.post("/component-type-rules/{rule_id}/duplicate", response_model=ComponentTypeRuleSchema)
def duplicate_component_type_rule(
    rule_id: int,
    db: Session = Depends(get_db),
):
    """Duplicate an existing component-type inference rule."""
    component_type_service.ensure_default_rules(db)
    source_rule = db.query(ComponentTypeRule).filter(ComponentTypeRule.id == rule_id).first()
    if not source_rule:
        raise HTTPException(status_code=404, detail="Component type rule not found")

    duplicated_rule = ComponentTypeRule(
        reference_prefix=_next_duplicate_prefix(db, source_rule.reference_prefix),
        mapped_type=source_rule.mapped_type,
        requires_confirmation=bool(source_rule.requires_confirmation),
        priority=int(source_rule.priority or 100),
        enabled=bool(source_rule.enabled),
        description=source_rule.description,
    )
    db.add(duplicated_rule)
    db.commit()
    db.refresh(duplicated_rule)
    invalidate_component_type_rules()
    return _serialize_component_type_rule(duplicated_rule)


@router.put("/component-type-rules/{rule_id}", response_model=ComponentTypeRuleSchema)
def update_component_type_rule(
    rule_id: int,
    payload: ComponentTypeRuleUpsertRequest,
    db: Session = Depends(get_db),
):
    """Update an existing component-type inference rule."""
    component_type_service.ensure_default_rules(db)
    rule = db.query(ComponentTypeRule).filter(ComponentTypeRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Component type rule not found")

    normalized_prefix = component_type_service.normalize_reference(payload.reference_prefix)
    duplicate = db.query(ComponentTypeRule).filter(
        ComponentTypeRule.id != rule_id,
        ComponentTypeRule.reference_prefix == normalized_prefix,
    ).first()
    if duplicate:
        raise HTTPException(
            status_code=409,
            detail=f"Rule with prefix '{normalized_prefix}' already exists",
        )

    rule.reference_prefix = normalized_prefix
    rule.mapped_type = component_type_service.normalize_for_storage(payload.mapped_type) or "UNDEFINED"
    rule.requires_confirmation = bool(payload.requires_confirmation)
    rule.priority = int(payload.priority)
    rule.enabled = bool(payload.enabled)
    rule.description = _clean_optional_text(payload.description)
    db.commit()
    db.refresh(rule)
    invalidate_component_type_rules()
    return _serialize_component_type_rule(rule)


@router.delete("/component-type-rules/{rule_id}", response_model=ComponentTypeRuleMutationResponse)
def delete_component_type_rule(
    rule_id: int,
    db: Session = Depends(get_db),
):
    """Delete an existing component-type inference rule."""
    component_type_service.ensure_default_rules(db)
    rule = db.query(ComponentTypeRule).filter(ComponentTypeRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Component type rule not found")

    deleted_prefix = rule.reference_prefix
    db.delete(rule)
    db.commit()
    invalidate_component_type_rules()
    remaining_count = db.query(ComponentTypeRule).count()
    return ComponentTypeRuleMutationResponse(
        success=True,
        message=f"Rule '{deleted_prefix}' deleted",
        rule_count=remaining_count,
    )


@router.post("/component-type-rules/reset", response_model=ComponentTypeRuleMutationResponse)
def reset_component_type_rules(db: Session = Depends(get_db)):
    """Reset the editable component-type rules to the built-in defaults."""
    rules = component_type_service.reset_rules(db)
    return ComponentTypeRuleMutationResponse(
        success=True,
        message="Component type rules reset to defaults",
        rule_count=len(rules),
    )


@router.get("/component-type-rules/export")
def export_component_type_rules(db: Session = Depends(get_db)):
    """Export the editable component-type rule catalog as JSON."""
    component_type_service.ensure_default_rules(db)
    rules = (
        db.query(ComponentTypeRule)
        .order_by(
            asc(ComponentTypeRule.priority),
            desc(func.length(ComponentTypeRule.reference_prefix)),
            asc(func.lower(func.coalesce(ComponentTypeRule.reference_prefix, ""))),
            asc(ComponentTypeRule.id),
        )
        .all()
    )
    payload = {
        "version": 1,
        "exported_at": utcnow().strftime('%Y-%m-%dT%H:%M:%SZ'),
        "rule_count": len(rules),
        "rules": [_serialize_component_type_rule(rule).model_dump() for rule in rules],
    }
    stream = BytesIO(json.dumps(payload, indent=2).encode("utf-8"))
    filename = f"component_type_rules_{utcnow().strftime('%Y%m%d_%H%M%S')}.json"
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    return StreamingResponse(
        stream,
        media_type="application/json",
        headers=headers,
    )


@router.post("/component-type-rules/import", response_model=ComponentTypeRuleImportResponse)
async def import_component_type_rules(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Import component-type rules from a JSON export or a raw rule array."""
    filename = (file.filename or "").lower()
    if filename and not filename.endswith(".json"):
        raise HTTPException(status_code=422, detail="Only .json files are supported for component-type rule import")

    try:
        payload = json.loads((await file.read()).decode("utf-8-sig"))
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Invalid JSON file: {exc}")

    if isinstance(payload, dict):
        raw_rules = payload.get("rules")
    else:
        raw_rules = payload

    if not isinstance(raw_rules, list):
        raise HTTPException(status_code=422, detail="JSON payload must contain a top-level 'rules' array or be a raw array")

    component_type_service.ensure_default_rules(db)
    created_count = 0
    updated_count = 0
    errors = []

    for index, raw_rule in enumerate(raw_rules, start=1):
        if not isinstance(raw_rule, dict):
            errors.append(f"Row {index}: expected an object")
            continue

        normalized_prefix = component_type_service.normalize_reference(raw_rule.get("reference_prefix"))
        if not normalized_prefix:
            errors.append(f"Row {index}: missing reference_prefix")
            continue

        try:
            priority = int(raw_rule.get("priority", 100))
        except (TypeError, ValueError):
            errors.append(f"Row {index}: invalid priority")
            continue

        mapped_type = component_type_service.normalize_for_storage(raw_rule.get("mapped_type")) or "UNDEFINED"
        requires_confirmation = bool(raw_rule.get("requires_confirmation"))
        enabled = bool(raw_rule.get("enabled", True))
        description = _clean_optional_text(raw_rule.get("description"))

        existing_rule = db.query(ComponentTypeRule).filter(ComponentTypeRule.reference_prefix == normalized_prefix).first()
        if existing_rule:
            existing_rule.mapped_type = mapped_type
            existing_rule.requires_confirmation = requires_confirmation
            existing_rule.priority = priority
            existing_rule.enabled = enabled
            existing_rule.description = description
            updated_count += 1
        else:
            db.add(
                ComponentTypeRule(
                    reference_prefix=normalized_prefix,
                    mapped_type=mapped_type,
                    requires_confirmation=requires_confirmation,
                    priority=priority,
                    enabled=enabled,
                    description=description,
                )
            )
            created_count += 1

    db.commit()
    skipped_count = len(errors)
    return ComponentTypeRuleImportResponse(
        success=skipped_count == 0,
        message=(
            f"Imported {created_count + updated_count} rule(s): "
            f"{created_count} created, {updated_count} updated, {skipped_count} skipped."
        ),
        item_count=len(raw_rules),
        created_count=created_count,
        updated_count=updated_count,
        skipped_count=skipped_count,
        errors=errors,
    )


@router.get("/machine-footprints", response_model=List[MachineFootprintCatalogSchema])
def list_machine_footprints(
    search: Optional[str] = Query(None, description="Filter by machine footprint, type, or feeder"),
    limit: int = Query(1000, ge=1, le=5000),
    db: Session = Depends(get_db),
):
    """List the machine-footprint reference catalog."""
    query = db.query(MachineFootprintRule)

    if search and search.strip():
        token = f"%{search.strip()}%"
        query = query.filter(
            or_(
                MachineFootprintRule.machine_footprint.ilike(token),
                MachineFootprintRule.component_type.ilike(token),
                MachineFootprintRule.feeder_type.ilike(token),
            )
        )

    catalog_entries = (
        query
        .order_by(
            asc(func.lower(func.coalesce(MachineFootprintRule.machine_footprint, ""))),
            asc(func.lower(func.coalesce(MachineFootprintRule.component_type, ""))),
            asc(MachineFootprintRule.tape_width_mm),
            asc(MachineFootprintRule.pitch_mm),
            asc(MachineFootprintRule.id),
        )
        .limit(limit)
        .all()
    )
    return [MachineFootprintCatalogSchema.model_validate(entry) for entry in catalog_entries]


@router.post(
    "/machine-footprints/import",
    response_model=MachineFootprintCatalogImportResponse,
)
async def import_machine_footprints(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Import or update the machine-footprint catalog from a semicolon-delimited text file."""
    try:
        result = machine_footprint_catalog_service.import_delimited_text(await file.read(), db)
        return MachineFootprintCatalogImportResponse(
            success=not result.errors,
            message=f"Imported {result.item_count} machine footprint rows",
            item_count=result.item_count,
            created_count=result.created_count,
            updated_count=result.updated_count,
            skipped_count=result.skipped_count,
            synchronized_component_count=result.synchronized_component_count,
            errors=result.errors,
        )
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=422, detail=str(exc))
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Machine-footprint import failed: {exc}")


@router.post("/components/library/import", response_model=ComponentLibraryImportResponse)
async def import_component_library(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Import a component master library from an Excel workbook."""
    tmp_path: Optional[str] = None

    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx") as tmp_file:
            tmp_file.write(await file.read())
            tmp_path = tmp_file.name

        result = component_library_service.import_workbook(tmp_path, db)
        return ComponentLibraryImportResponse(
            success=not result.errors,
            message=f"Imported {result.item_count} component library rows",
            item_count=result.item_count,
            created_count=result.created_count,
            updated_count=result.updated_count,
            skipped_count=result.skipped_count,
            errors=result.errors,
        )
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=422, detail=str(exc))
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Component library import failed: {exc}")
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)


@router.get("/components/library/export")
def export_component_library(db: Session = Depends(get_db)):
    """Export the current component library in the external Excel format."""
    components = db.query(Component).all()
    workbook_stream = component_library_service.export_workbook(components)
    filename = f"component_library_{utcnow().strftime('%Y%m%d_%H%M%S')}.xlsx"
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    return StreamingResponse(
        workbook_stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers=headers,
    )


@router.get("/components/{component_id}", response_model=ComponentSchema)
def get_component(component_id: int, db: Session = Depends(get_db)):
    """Get a component by its identifier."""
    component = (
        db.query(Component)
        .options(joinedload(Component.fixed_cart))
        .filter(Component.id == component_id)
        .first()
    )
    if not component:
        raise HTTPException(status_code=404, detail="Component not found")

    return _serialize_component(component)


@router.get("/mappings/footprints", response_model=List[FootprintMappingSchema])
def list_footprint_mappings(
    search: Optional[str] = Query(None, description="Filter by Eagle or PnP footprint"),
    db: Session = Depends(get_db),
):
    """List Eagle -> PnP footprint mappings."""
    query = db.query(FootprintMapping)

    if search:
        query = query.filter(
            or_(
                FootprintMapping.footprint_eagle.ilike(f"%{search}%"),
                FootprintMapping.footprint_pnp.ilike(f"%{search}%"),
            )
        )

    mappings = query.order_by(FootprintMapping.footprint_eagle).all()
    return [FootprintMappingSchema.model_validate(mapping) for mapping in mappings]


@router.post("/mappings/footprints", response_model=FootprintMappingSchema)
def create_footprint_mapping(payload: FootprintMappingCreateSchema, db: Session = Depends(get_db)):
    """Create a reusable Eagle -> PnP mapping."""
    normalized_eagle = bom_service.normalize_footprint_name(payload.footprint_eagle)
    existing = db.query(FootprintMapping).filter(
        FootprintMapping.footprint_eagle == normalized_eagle
    ).first()
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"Mapping for footprint '{normalized_eagle}' already exists",
        )

    mapping = _upsert_footprint_mapping(
        db,
        normalized_eagle,
        payload.footprint_pnp,
        machine_compatible=payload.machine_compatible,
        notes=payload.notes,
    )
    db.commit()
    db.refresh(mapping)
    invalidate_footprint_mappings()
    return FootprintMappingSchema.model_validate(mapping)


@router.put("/mappings/footprints/{mapping_id}", response_model=FootprintMappingSchema)
def update_footprint_mapping(
    mapping_id: int,
    payload: FootprintMappingCreateSchema,
    db: Session = Depends(get_db),
):
    """Update an existing Eagle -> PnP mapping."""
    mapping = db.query(FootprintMapping).filter(FootprintMapping.id == mapping_id).first()
    if not mapping:
        raise HTTPException(status_code=404, detail="Footprint mapping not found")

    normalized_eagle = bom_service.normalize_footprint_name(payload.footprint_eagle)
    duplicate = db.query(FootprintMapping).filter(
        FootprintMapping.id != mapping_id,
        FootprintMapping.footprint_eagle == normalized_eagle,
    ).first()
    if duplicate:
        raise HTTPException(
            status_code=409,
            detail=f"Mapping for footprint '{normalized_eagle}' already exists",
        )

    mapping.footprint_eagle = normalized_eagle
    mapping.footprint_pnp = payload.footprint_pnp.strip()
    mapping.machine_compatible = payload.machine_compatible
    mapping.notes = payload.notes
    for sibling in db.query(FootprintMapping).filter(
        FootprintMapping.id != mapping_id,
        FootprintMapping.footprint_eagle == normalized_eagle,
    ).all():
        db.delete(sibling)
    db.commit()
    db.refresh(mapping)
    invalidate_footprint_mappings()
    return FootprintMappingSchema.model_validate(mapping)
