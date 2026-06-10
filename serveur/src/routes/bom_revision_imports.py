"""BOM import endpoints."""

import os
import tempfile
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session

from ..database import utcnow
from ..models.bom import BomReference, BomRevision
from ..schemas.bom import BomImportResponse
from ..utils.uploads import read_upload_capped
from .bom import get_db
from .bom_support import (
    _build_revision_session_payload,
    _collapse_duplicate_revisions,
    _ensure_bom_category,
    _enum_value,
    _get_component_lookup,
    _get_footprint_lookup,
    _get_logical_revisions,
    _replace_revision_items,
    _serialize_bom_item,
    _try_save_revision_snapshot,
    bom_service,
)

router = APIRouter(tags=["bom"])


@router.post("/import", response_model=BomImportResponse)
async def import_bom_file(
    file: UploadFile = File(...),
    reference: str = Query(..., min_length=1, max_length=100, description="BOM reference name"),
    revision: str = Query(default="REV_A", description="Revision identifier"),
    side: str = Query(default="TOP", pattern="^(TOP|BOT)$", description="PCB side: TOP or BOT"),
    category: Optional[str] = Query(None, description="Optional card category applied to the full reference"),
    description: Optional[str] = Query(None, description="BOM description"),
    db: Session = Depends(get_db),
):
    """Import an Eagle-style BOM text file, harmonize it, then persist it."""
    tmp_path: Optional[str] = None

    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".txt") as tmp_file:
            tmp_file.write(await read_upload_capped(file))
            tmp_path = tmp_file.name

        footprint_lookup = _get_footprint_lookup(db)
        import_result = bom_service.import_bom(tmp_path, footprint_lookup)
        if not import_result.success:
            raise HTTPException(
                status_code=422,
                detail=f"BOM parsing failed: {'; '.join(import_result.errors[:5])}",
            )

        is_valid, validation_errors = bom_service.validate_bom_data(import_result.items)
        if not is_valid:
            raise HTTPException(
                status_code=422,
                detail=f"Invalid BOM payload: {'; '.join(validation_errors[:5])}",
            )

        bom_ref = db.query(BomReference).filter(BomReference.reference == reference).first()
        if not bom_ref:
            bom_ref = BomReference(
                reference=reference,
                category=_ensure_bom_category(db, category),
                description=description,
                created_at=utcnow(),
                updated_at=utcnow(),
            )
            db.add(bom_ref)
            db.flush()
        else:
            bom_ref.updated_at = utcnow()
            if category is not None:
                bom_ref.category = _ensure_bom_category(db, category)
            if description is not None:
                bom_ref.description = description

        existing_revisions = _get_logical_revisions(db, bom_ref.id, revision, side)
        if existing_revisions:
            bom_revision = existing_revisions[0]
            _collapse_duplicate_revisions(db, bom_revision, existing_revisions[1:])
            bom_revision.created_at = utcnow()
            bom_revision.status = BomRevision.StatusEnum.DRAFT
        else:
            bom_revision = BomRevision(
                bom_ref_id=bom_ref.id,
                revision=revision,
                type=BomRevision.TypeEnum(side),
                created_at=utcnow(),
                status=BomRevision.StatusEnum.DRAFT,
            )
            db.add(bom_revision)
            db.flush()

        persisted_items = _replace_revision_items(
            db,
            bom_revision,
            import_result.items,
            side,
        )

        db.commit()
        db.refresh(bom_revision)
        response_warnings = list(import_result.warnings)
        _try_save_revision_snapshot(bom_revision, warnings=response_warnings, action="import")

        component_lookup = _get_component_lookup(db)
        serialized_items = [_serialize_bom_item(db, item, component_lookup) for item in persisted_items]

        return BomImportResponse(
            success=True,
            bom_reference_id=bom_ref.id,
            bom_revision_id=bom_revision.id,
            reference=bom_ref.reference,
            revision=bom_revision.revision,
            side=_enum_value(bom_revision.type),
            status=_enum_value(bom_revision.status),
            message=f"Successfully imported {len(import_result.items)} items",
            item_count=len(import_result.items),
            items=serialized_items,
            stats=import_result.stats,
            errors=import_result.errors,
            warnings=response_warnings,
        )

    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Import failed: {exc}")
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)
