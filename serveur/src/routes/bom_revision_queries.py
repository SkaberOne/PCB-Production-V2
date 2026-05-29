"""Read-only BOM revision endpoints."""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models.bom import BomItem, BomReference, BomRevision
from ..schemas.bom import (
    BomDetailResponse,
    BomItemSchema,
    BomReferenceSchema,
    BomRevisionDetailResponse,
    BomRevisionSchema,
)
from .bom import get_db
from .bom_support import _enum_value

router = APIRouter(tags=["bom"])


def _get_bom_reference_or_404(db: Session, bom_id: int) -> BomReference:
    bom_ref = db.query(BomReference).filter(BomReference.id == bom_id).first()
    if not bom_ref:
        raise HTTPException(status_code=404, detail="BOM not found")
    return bom_ref


def _get_revision_or_404(db: Session, bom_id: int, revision_id: int) -> BomRevision:
    revision = db.query(BomRevision).filter(
        BomRevision.id == revision_id,
        BomRevision.bom_ref_id == bom_id,
    ).first()
    if not revision:
        raise HTTPException(status_code=404, detail="Revision not found")
    return revision


def _build_revision_item_counts(db: Session, revisions: List[BomRevision]) -> dict:
    revision_ids = [revision.id for revision in revisions]
    if not revision_ids:
        return {}

    return {
        revision_id: item_count
        for revision_id, item_count in (
            db.query(BomItem.bom_revision_id, func.count(BomItem.id))
            .filter(BomItem.bom_revision_id.in_(revision_ids))
            .group_by(BomItem.bom_revision_id)
            .all()
        )
    }


@router.get("/{bom_id}", response_model=BomDetailResponse)
def get_bom_detail(bom_id: int, db: Session = Depends(get_db)):
    """Get a BOM reference with all its revisions."""
    bom_ref = _get_bom_reference_or_404(db, bom_id)

    revisions = db.query(BomRevision).filter(BomRevision.bom_ref_id == bom_id).all()
    item_counts = _build_revision_item_counts(db, revisions)
    revision_schemas = []
    total_items = 0

    for revision in revisions:
        item_count = item_counts.get(revision.id, 0)
        total_items += item_count
        revision_schemas.append(
            BomRevisionSchema(
                id=revision.id,
                revision=revision.revision,
                type=_enum_value(revision.type),
                status=_enum_value(revision.status),
                created_at=revision.created_at,
                item_count=item_count,
            )
        )

    return BomDetailResponse(
        reference=BomReferenceSchema.model_validate(bom_ref),
        revisions=revision_schemas,
        total_items=total_items,
    )


@router.get("/{bom_id}/revisions")
def list_bom_revisions(bom_id: int, db: Session = Depends(get_db)):
    """List all revisions for a BOM reference."""
    bom_ref = _get_bom_reference_or_404(db, bom_id)
    revisions = db.query(BomRevision).filter(BomRevision.bom_ref_id == bom_id).all()
    item_counts = _build_revision_item_counts(db, revisions)

    return {
        "bom_id": bom_id,
        "bom_reference": bom_ref.reference,
        "revisions": [
            {
                "id": revision.id,
                "revision": revision.revision,
                "type": _enum_value(revision.type),
                "status": _enum_value(revision.status),
                "created_at": revision.created_at,
                "item_count": item_counts.get(revision.id, 0),
            }
            for revision in revisions
        ],
    }


@router.get("/{bom_id}/revisions/{revision_id}", response_model=BomRevisionDetailResponse)
def get_bom_revision_detail(bom_id: int, revision_id: int, db: Session = Depends(get_db)):
    """Get a BOM revision with all persisted items."""
    revision = _get_revision_or_404(db, bom_id, revision_id)
    revision_schema = BomRevisionSchema(
        id=revision.id,
        revision=revision.revision,
        type=_enum_value(revision.type),
        status=_enum_value(revision.status),
        created_at=revision.created_at,
        item_count=len(revision.items),
    )
    items = [BomItemSchema.model_validate(item) for item in revision.items]
    return BomRevisionDetailResponse(revision=revision_schema, items=items)


@router.get("/{bom_id}/revisions/{revision_id}/items", response_model=List[BomItemSchema])
def list_bom_items(
    bom_id: int,
    revision_id: int,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    footprint: Optional[str] = Query(None, description="Filter by footprint"),
    dnp_only: bool = Query(False, description="Show only DNP items"),
    db: Session = Depends(get_db),
):
    """List items in a BOM revision."""
    _get_revision_or_404(db, bom_id, revision_id)

    query = db.query(BomItem).filter(BomItem.bom_revision_id == revision_id)
    if footprint:
        query = query.filter(BomItem.footprint_eagle.ilike(f"%{footprint}%"))
    if dnp_only:
        query = query.filter(BomItem.dnp.is_(True))

    items = query.offset(skip).limit(limit).all()
    return [BomItemSchema.model_validate(item) for item in items]
