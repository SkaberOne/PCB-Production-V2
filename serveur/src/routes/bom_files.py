"""Stored BOM files, categories and reference-level file operations."""

from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload

from ..database import utcnow
from ..models.bom import BomCategory, BomItem, BomReference, BomRevision
from ..models.commands import CommandItem
from ..models.production import ProductionBomRevision
from ..schemas.bom import (
    BomCategoryCreateRequest,
    BomCategoryListResponse,
    BomCategorySchema,
    BomImportResponse,
    BomReferenceCategoryUpdateRequest,
    BomReferenceSchema,
    BomStoredFileListResponse,
    BomStoredFileMutationResponse,
    BomStoredFileUpdateRequest,
)
from .bom import get_db
from .bom_support import (
    _build_revision_session_payload,
    _build_stored_file_entry,
    _collapse_duplicate_revisions,
    _clean_optional_text,
    _ensure_bom_category,
    _enum_value,
    _get_logical_revisions,
    _try_delete_revision_snapshot,
    _try_save_revision_snapshot,
    bom_file_service,
)

router = APIRouter(tags=["bom"])


@router.get("/files", response_model=BomStoredFileListResponse)
def list_saved_bom_files(
    search: Optional[str] = Query(None, description="Search by reference or category"),
    sort: str = Query("alpha", pattern="^(alpha|recent)$", description="Sort mode"),
    db: Session = Depends(get_db),
):
    """List the latest stored BOM text files grouped by logical reference/revision/side."""
    normalized_search = (search or "").strip().lower()
    revisions_query = (
        db.query(BomRevision)
        .options(joinedload(BomRevision.reference))
        .join(BomReference)
    )
    if normalized_search:
        search_pattern = f"%{normalized_search}%"
        revisions_query = revisions_query.filter(
            or_(
                func.lower(BomReference.reference).like(search_pattern),
                func.lower(func.coalesce(BomReference.category, "")).like(search_pattern),
            )
        )

    revisions = revisions_query.order_by(BomRevision.created_at.desc(), BomRevision.id.desc()).all()

    entries = []
    seen_keys = set()

    for revision in revisions:
        reference_name = revision.reference.reference if revision.reference else ""
        unique_key = (revision.bom_ref_id, revision.revision, _enum_value(revision.type))
        if unique_key in seen_keys:
            continue

        file_path = bom_file_service.get_file_path(reference_name, revision.revision, _enum_value(revision.type))
        if not file_path.exists():
            continue

        seen_keys.add(unique_key)
        entries.append(_build_stored_file_entry(revision))

    if sort == "recent":
        entries.sort(
            key=lambda entry: (
                entry.created_at or datetime.min,
                entry.reference.lower(),
                entry.revision.lower(),
                entry.side,
            ),
            reverse=True,
        )
    else:
        entries.sort(key=lambda entry: (entry.reference.lower(), entry.revision.lower(), entry.side))

    return BomStoredFileListResponse(items=entries)


@router.get("/files/{bom_revision_id}/session", response_model=BomImportResponse)
def load_saved_bom_session(
    bom_revision_id: int,
    db: Session = Depends(get_db),
):
    """Load a stored BOM revision into the frontend session payload shape."""
    revision = db.query(BomRevision).filter(BomRevision.id == bom_revision_id).first()
    if not revision:
        raise HTTPException(status_code=404, detail="Stored BOM revision not found")

    return _build_revision_session_payload(
        db,
        revision,
        message=f"Loaded stored BOM {revision.reference.reference if revision.reference else ''} {revision.revision} {_enum_value(revision.type)}",
    )


@router.get("/categories", response_model=BomCategoryListResponse)
def list_bom_categories(
    db: Session = Depends(get_db),
):
    """List reusable BOM categories, including categories already used by references."""
    reference_counts = {
        category_name: int(reference_count or 0)
        for category_name, reference_count in (
            db.query(BomReference.category, func.count(BomReference.id))
            .filter(BomReference.category.isnot(None))
            .group_by(BomReference.category)
            .all()
        )
    }

    catalog_entries = db.query(BomCategory).order_by(BomCategory.name).all()
    items = []
    seen_names = set()

    for category in catalog_entries:
        seen_names.add(category.name)
        items.append(
            BomCategorySchema(
                id=category.id,
                name=category.name,
                description=category.description,
                reference_count=reference_counts.get(category.name, 0),
                created_at=category.created_at,
                updated_at=category.updated_at,
            )
        )

    for category_name, reference_count in sorted(reference_counts.items()):
        if category_name in seen_names:
            continue
        items.append(
            BomCategorySchema(
                id=None,
                name=category_name,
                description=None,
                reference_count=reference_count,
                created_at=None,
                updated_at=None,
            )
        )

    return BomCategoryListResponse(items=items)


@router.post("/categories", response_model=BomCategorySchema)
def create_bom_category(
    payload: BomCategoryCreateRequest,
    db: Session = Depends(get_db),
):
    """Create a reusable BOM category for manual grouping in the explorer."""
    normalized_name = _clean_optional_text(payload.name)
    if not normalized_name:
        raise HTTPException(status_code=422, detail="Category name cannot be empty")

    existing = db.query(BomCategory).filter(BomCategory.name == normalized_name).first()
    if existing:
        raise HTTPException(status_code=409, detail="This category already exists")

    category = BomCategory(
        name=normalized_name,
        description=_clean_optional_text(payload.description),
        created_at=utcnow(),
        updated_at=utcnow(),
    )
    db.add(category)
    db.commit()
    db.refresh(category)

    return BomCategorySchema(
        id=category.id,
        name=category.name,
        description=category.description,
        reference_count=0,
        created_at=category.created_at,
        updated_at=category.updated_at,
    )


@router.patch("/references/{bom_reference_id}/category", response_model=BomReferenceSchema)
def update_bom_reference_category(
    bom_reference_id: int,
    payload: BomReferenceCategoryUpdateRequest,
    db: Session = Depends(get_db),
):
    """Assign a manual card category to a whole PCB reference."""
    bom_ref = db.query(BomReference).filter(BomReference.id == bom_reference_id).first()
    if not bom_ref:
        raise HTTPException(status_code=404, detail="BOM reference not found")

    bom_ref.category = _ensure_bom_category(db, payload.category)
    bom_ref.updated_at = utcnow()
    db.commit()
    db.refresh(bom_ref)
    return BomReferenceSchema.model_validate(bom_ref)


@router.patch("/files/{bom_revision_id}", response_model=BomStoredFileMutationResponse)
def rename_saved_bom_file(
    bom_revision_id: int,
    payload: BomStoredFileUpdateRequest,
    db: Session = Depends(get_db),
):
    """Rename the logical reference/revision for a stored BOM entry."""
    revision = db.query(BomRevision).filter(BomRevision.id == bom_revision_id).first()
    if not revision or not revision.reference:
        raise HTTPException(status_code=404, detail="Stored BOM revision not found")

    old_reference = revision.reference.reference
    old_revision = revision.revision
    old_bom_reference_id = revision.bom_ref_id
    old_side = _enum_value(revision.type)
    old_group = _get_logical_revisions(db, old_bom_reference_id, old_revision, revision.type)
    old_group_ids = {candidate.id for candidate in old_group}
    old_snapshot_path = bom_file_service.get_file_path(old_reference, old_revision, old_side)

    new_reference = payload.reference.strip()
    new_revision = payload.revision.strip()
    if not new_reference or not new_revision:
        raise HTTPException(status_code=422, detail="Reference and revision cannot be empty")

    target_reference = db.query(BomReference).filter(BomReference.reference == new_reference).first()
    if not target_reference:
        target_reference = BomReference(
            reference=new_reference,
            category=revision.reference.category if revision.reference else None,
            created_at=utcnow(),
            updated_at=utcnow(),
        )
        db.add(target_reference)
        db.flush()

    duplicate_revision = db.query(BomRevision).filter(
        ~BomRevision.id.in_(old_group_ids),
        BomRevision.bom_ref_id == target_reference.id,
        BomRevision.revision == new_revision,
        BomRevision.type == revision.type,
    ).first()
    if duplicate_revision:
        raise HTTPException(
            status_code=409,
            detail=(
                f"A stored BOM already exists for {new_reference} {new_revision} "
                f"{_enum_value(revision.type)}"
            ),
        )

    _collapse_duplicate_revisions(
        db,
        revision,
        [candidate for candidate in old_group if candidate.id != revision.id],
    )

    revision.bom_ref_id = target_reference.id
    revision.revision = new_revision
    target_reference.updated_at = utcnow()

    db.commit()
    db.refresh(revision)
    _try_save_revision_snapshot(revision, action="rename")

    if old_snapshot_path != bom_file_service.get_file_path(new_reference, new_revision, old_side):
        _try_delete_revision_snapshot(old_reference, old_revision, old_side, action="rename cleanup")

    remaining_old_revisions = db.query(BomRevision).filter(BomRevision.bom_ref_id == old_bom_reference_id).count()
    if remaining_old_revisions == 0:
        old_reference_model = db.query(BomReference).filter(BomReference.id == old_bom_reference_id).first()
        if old_reference_model:
            db.delete(old_reference_model)
            db.commit()

    return BomStoredFileMutationResponse(
        success=True,
        message=f"Stored BOM renamed to {new_reference} {new_revision}",
        bom_reference_id=target_reference.id,
        bom_revision_id=revision.id,
    )


@router.delete("/files/{bom_revision_id}", response_model=BomStoredFileMutationResponse)
def delete_saved_bom_file(
    bom_revision_id: int,
    db: Session = Depends(get_db),
):
    """Delete a stored BOM side entry and its snapshot file."""
    revision = db.query(BomRevision).filter(BomRevision.id == bom_revision_id).first()
    if not revision or not revision.reference:
        raise HTTPException(status_code=404, detail="Stored BOM revision not found")

    reference_name = revision.reference.reference
    revision_name = revision.revision
    side_name = _enum_value(revision.type)
    bom_reference_id = revision.bom_ref_id

    logical_duplicates = db.query(BomRevision).filter(
        BomRevision.bom_ref_id == revision.bom_ref_id,
        BomRevision.revision == revision.revision,
        BomRevision.type == revision.type,
    ).all()
    logical_duplicate_ids = [duplicate.id for duplicate in logical_duplicates]

    try:
        if logical_duplicate_ids:
            db.query(ProductionBomRevision).filter(
                ProductionBomRevision.bom_revision_id.in_(logical_duplicate_ids)
            ).delete(synchronize_session=False)
            db.query(CommandItem).filter(
                CommandItem.bom_revision_id.in_(logical_duplicate_ids)
            ).delete(synchronize_session=False)

        for duplicate in logical_duplicates:
            db.delete(duplicate)

        db.flush()

        remaining_revisions = db.query(BomRevision).filter(BomRevision.bom_ref_id == bom_reference_id).count()
        if remaining_revisions == 0:
            bom_reference = db.query(BomReference).filter(BomReference.id == bom_reference_id).first()
            if bom_reference:
                db.delete(bom_reference)

        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to delete BOM from database: {str(exc)}")

    _try_delete_revision_snapshot(reference_name, revision_name, side_name, action="delete")

    return BomStoredFileMutationResponse(
        success=True,
        message=f"Stored BOM {reference_name} {revision_name} {side_name} deleted",
        bom_reference_id=bom_reference_id,
        bom_revision_id=bom_revision_id,
    )
