"""Endpoints : stock de cartes finies + commandes client/machine (ADR 0017).

Montés sous /api/marketplace (préfixe hérité de marketplace.router).
"""

from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db
from ..services.board_stock_service import BoardStockService, ClientOrderService

router = APIRouter(tags=["board-stock"])


# ─────────────────────────── Schémas ───────────────────────────

class BoardStockUpsert(BaseModel):
    qty_in_stock: Optional[int] = Field(default=None, ge=0)
    min_stock: Optional[int] = Field(default=None, ge=0)
    unit_price_override: Optional[float] = Field(default=None, ge=0)
    clear_price_override: bool = False
    cards_tested: Optional[int] = Field(default=None, ge=0)
    cards_validated: Optional[int] = Field(default=None, ge=0)
    cards_to_debug: Optional[int] = Field(default=None, ge=0)
    notes: Optional[str] = Field(default=None, max_length=1000)


class BoardStockAdjust(BaseModel):
    delta: int


class OrderLineInput(BaseModel):
    bom_reference_id: int = Field(..., gt=0)
    quantity: int = Field(..., ge=0)
    notes: Optional[str] = Field(default=None, max_length=500)


class ClientOrderCreate(BaseModel):
    order_type: str = Field(default="CLIENT")
    recipient: Optional[str] = Field(default=None, max_length=200)
    due_date: Optional[datetime] = None
    notes: Optional[str] = Field(default=None, max_length=1000)
    lines: List[OrderLineInput] = Field(default_factory=list)


class ClientOrderUpdate(BaseModel):
    recipient: Optional[str] = Field(default=None, max_length=200)
    order_type: Optional[str] = None
    status: Optional[str] = None
    due_date: Optional[datetime] = None
    notes: Optional[str] = Field(default=None, max_length=1000)


class OrderLinesSet(BaseModel):
    lines: List[OrderLineInput] = Field(default_factory=list)


class OrderPrepare(BaseModel):
    line_id: int = Field(..., gt=0)
    qty: int


# ─────────────────────────── Stock cartes ───────────────────────────

@router.get("/board-stock/to-produce")
def board_stock_to_produce(db: Session = Depends(get_db)):
    """Manques de cartes (demandes de fabrication) pour le dashboard."""
    return BoardStockService.cards_to_produce(db)


@router.get("/board-stock")
def list_board_stock(db: Session = Depends(get_db)):
    return BoardStockService.list_board_stock(db)


@router.put("/board-stock/{bom_reference_id}")
def upsert_board_stock(bom_reference_id: int, request: BoardStockUpsert, db: Session = Depends(get_db)):
    try:
        row = BoardStockService.upsert(
            db,
            bom_reference_id,
            qty_in_stock=request.qty_in_stock,
            min_stock=request.min_stock,
            unit_price_override=request.unit_price_override,
            clear_price_override=request.clear_price_override,
            cards_tested=request.cards_tested,
            cards_validated=request.cards_validated,
            cards_to_debug=request.cards_to_debug,
            notes=request.notes,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return {"bom_reference_id": row.bom_reference_id, "qty_in_stock": row.qty_in_stock}


@router.post("/board-stock/{bom_reference_id}/adjust")
def adjust_board_stock(bom_reference_id: int, request: BoardStockAdjust, db: Session = Depends(get_db)):
    row = BoardStockService.adjust_qty(db, bom_reference_id, request.delta)
    return {"bom_reference_id": row.bom_reference_id, "qty_in_stock": row.qty_in_stock}


# ─────────────────────────── Commandes client/machine ───────────────────────────

@router.get("/client-orders")
def list_client_orders(db: Session = Depends(get_db)):
    return ClientOrderService.list_orders(db)


@router.post("/client-orders")
def create_client_order(request: ClientOrderCreate, db: Session = Depends(get_db)):
    return ClientOrderService.create_order(
        db,
        order_type=request.order_type,
        recipient=request.recipient,
        due_date=request.due_date,
        notes=request.notes,
        lines=[line.model_dump() for line in request.lines],
    )


@router.get("/client-orders/{order_id}")
def get_client_order(order_id: int, db: Session = Depends(get_db)):
    try:
        return ClientOrderService.get_order(db, order_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.put("/client-orders/{order_id}")
def update_client_order(order_id: int, request: ClientOrderUpdate, db: Session = Depends(get_db)):
    try:
        return ClientOrderService.update_order(
            db,
            order_id,
            recipient=request.recipient,
            order_type=request.order_type,
            status=request.status,
            due_date=request.due_date,
            due_date_provided="due_date" in request.model_fields_set,
            notes=request.notes,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.delete("/client-orders/{order_id}")
def delete_client_order(order_id: int, db: Session = Depends(get_db)):
    try:
        ClientOrderService.delete_order(db, order_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return {"deleted": order_id}


@router.put("/client-orders/{order_id}/lines")
def set_client_order_lines(order_id: int, request: OrderLinesSet, db: Session = Depends(get_db)):
    try:
        return ClientOrderService.set_lines(db, order_id, [line.model_dump() for line in request.lines])
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.post("/client-orders/{order_id}/prepare")
def prepare_client_order(order_id: int, request: OrderPrepare, db: Session = Depends(get_db)):
    try:
        return ClientOrderService.prepare(db, order_id, request.line_id, request.qty)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
