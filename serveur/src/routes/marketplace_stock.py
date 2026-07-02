"""Physical component stock endpoints (ADR 0010, Phase 1).

Mounted under ``/api/marketplace`` so the public paths are ``/api/marketplace/stock/...``.
The auto IN on reception lives in ``ProductionCommandService.set_receipt`` (the single
write path for ``CommandReceipt``), not here.
"""

from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.bom import Component
from ..schemas.stock import (
    ComponentParamsRequest,
    ComponentStockOut,
    GlobalSettingsRequest,
    MovementCreateRequest,
    MovementOut,
    SettingsOut,
    StockLineOut,
)
from ..services.stock_service import StockService, _UNSET

router = APIRouter(tags=["stock"])


@router.get("/stock", response_model=List[StockLineOut])
def list_stock(db: Session = Depends(get_db)):
    """Library components + balance + breakdown + status (OK / bas / manque)."""
    return StockService.list_stock(db)


@router.get("/stock/settings", response_model=SettingsOut)
def get_settings(db: Session = Depends(get_db)):
    return StockService.get_settings(db)


@router.put("/stock/settings", response_model=SettingsOut)
def update_settings(request: GlobalSettingsRequest, db: Session = Depends(get_db)):
    return StockService.set_global_loss_pct(db, request.global_loss_pct)


@router.post("/stock/movements", response_model=ComponentStockOut)
def create_movement(request: MovementCreateRequest, db: Session = Depends(get_db)):
    """Manual movement: ``declaration`` (set-to recount) or ``correction``."""
    if db.get(Component, request.component_id) is None:
        raise HTTPException(status_code=404, detail="Composant introuvable")
    if request.motif == "declaration":
        stock = StockService.post_declaration(
            db,
            component_id=request.component_id,
            qty_reel=request.qty_reel,
            qty_bag=request.qty_bag,
            qty_tube=request.qty_tube,
            note=request.note,
        )
    else:  # correction
        if request.new_total is None:
            raise HTTPException(
                status_code=422, detail="new_total requis pour une correction"
            )
        stock = StockService.post_correction(
            db,
            component_id=request.component_id,
            new_total=request.new_total,
            note=request.note,
        )
    return stock


@router.get("/stock/{component_id}", response_model=ComponentStockOut)
def get_component_stock(component_id: int, db: Session = Depends(get_db)):
    if db.get(Component, component_id) is None:
        raise HTTPException(status_code=404, detail="Composant introuvable")
    return StockService.get_or_create_stock(db, component_id)


@router.put("/stock/{component_id}/params", response_model=ComponentStockOut)
def set_component_params(
    component_id: int,
    request: ComponentParamsRequest,
    db: Session = Depends(get_db),
):
    if db.get(Component, component_id) is None:
        raise HTTPException(status_code=404, detail="Composant introuvable")
    fields = request.model_fields_set
    return StockService.set_component_params(
        db,
        component_id,
        safety_stock=request.safety_stock,
        loss_pct=(request.loss_pct if "loss_pct" in fields else _UNSET),
    )


@router.get("/stock/{component_id}/journal", response_model=List[MovementOut])
def get_journal(component_id: int, db: Session = Depends(get_db)):
    if db.get(Component, component_id) is None:
        raise HTTPException(status_code=404, detail="Composant introuvable")
    return StockService.get_journal(db, component_id)


@router.post("/stock/movements/{movement_id}/cancel", response_model=ComponentStockOut)
def cancel_movement(movement_id: int, db: Session = Depends(get_db)):
    """Reversible cancel (appends an inverse movement, never deletes)."""
    try:
        movement = StockService.cancel_movement(db, movement_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return StockService.get_or_create_stock(db, movement.component_id)
