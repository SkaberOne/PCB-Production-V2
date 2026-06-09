"""Costing endpoints — « Prix carte à la production ».

Two sub-views (UI): coût de la production (lot) and coût unitaire / carte
(reference + history). See ADR 0005 / audit 2026-06-09.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas.costing import UpdateCostInputRequest, UpdateCostParametersRequest
from ..services.costing_service import CostingService

router = APIRouter(prefix="/costing", tags=["costing"])


@router.get("/parameters")
def get_parameters(db: Session = Depends(get_db)):
    """Workshop costing parameters (rates, VAT, times)."""
    return CostingService.parameters_as_dict(db)


@router.put("/parameters")
def update_parameters(request: UpdateCostParametersRequest, db: Session = Depends(get_db)):
    """Update the workshop costing parameters."""
    return CostingService.update_parameters(db, request.model_dump(exclude_unset=True))


@router.get("/cards")
def list_cards(db: Session = Depends(get_db)):
    """Cards selectable in the UI + their latest reference price."""
    return CostingService.list_cards(db)


@router.get("/cards/{bom_reference_id}/history")
def card_history(bom_reference_id: int, db: Session = Depends(get_db)):
    """Reference price + full price history of a card."""
    return CostingService.card_history(db, bom_reference_id)


@router.get("/productions/{production_id}")
def compute_production(production_id: int, db: Session = Depends(get_db)):
    """Live costing of every card of a production + lot totals."""
    try:
        return CostingService.compute_production(db, production_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.get("/productions/{production_id}/inputs")
def get_inputs(production_id: int, db: Session = Depends(get_db)):
    """Per-production non-material costing inputs."""
    return CostingService.input_as_dict(db, production_id)


@router.put("/productions/{production_id}/inputs")
def update_inputs(
    production_id: int,
    request: UpdateCostInputRequest,
    db: Session = Depends(get_db),
):
    """Update the per-production costing inputs."""
    return CostingService.update_input(db, production_id, request.model_dump(exclude_unset=True))


@router.post("/productions/{production_id}/snapshot")
def snapshot_production(production_id: int, db: Session = Depends(get_db)):
    """Freeze the costing into the per-card price history (new reference price)."""
    try:
        return CostingService.snapshot_production(db, production_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
