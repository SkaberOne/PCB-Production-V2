"""Endpoints : catalogue de cartes unifié (ADR 0018).

Montés sous /api/marketplace (préfixe hérité de marketplace.router).
"""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db
from ..services.card_catalog_service import CardCatalogService, CardReferenceConflict

router = APIRouter(tags=["cards"])


class CardUpdate(BaseModel):
    name: Optional[str] = Field(default=None, max_length=200)
    part_number: Optional[str] = Field(default=None, max_length=100)
    card_type: Optional[str] = None  # SIMPLE | ASSEMBLY
    reference: Optional[str] = Field(default=None, min_length=1, max_length=100)


class AssemblyItemInput(BaseModel):
    child_reference_id: Optional[int] = Field(default=None, gt=0)
    component_id: Optional[int] = Field(default=None, gt=0)
    quantity: int = Field(..., ge=1)


class AssemblySet(BaseModel):
    items: List[AssemblyItemInput] = Field(default_factory=list)


@router.get("/cards")
def list_cards(db: Session = Depends(get_db)):
    return CardCatalogService.list_cards(db)


@router.get("/cards/{bom_reference_id}")
def get_card(bom_reference_id: int, db: Session = Depends(get_db)):
    try:
        return CardCatalogService.get_card(db, bom_reference_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.put("/cards/{bom_reference_id}")
def update_card(bom_reference_id: int, request: CardUpdate, db: Session = Depends(get_db)):
    try:
        return CardCatalogService.update_card(
            db,
            bom_reference_id,
            name=request.name,
            part_number=request.part_number,
            card_type=request.card_type,
            reference=request.reference,
        )
    except CardReferenceConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.put("/cards/{bom_reference_id}/assembly")
def set_assembly(bom_reference_id: int, request: AssemblySet, db: Session = Depends(get_db)):
    try:
        return CardCatalogService.set_assembly(db, bom_reference_id, [i.model_dump() for i in request.items])
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
