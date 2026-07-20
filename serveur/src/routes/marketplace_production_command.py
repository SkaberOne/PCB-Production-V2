"""Implicit per-production command + receiving (qty received) endpoints.

The Commande page uses these instead of manually generating a command.
See conversation 2026-06-03.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas.marketplace import (
    SetLineDetailRequest,
    SetReceiptRequest,
    SyncProductionCommandRequest,
)
from ..services.production_command_service import ProductionCommandService

router = APIRouter(tags=["production-command"])


@router.post("/productions/{production_id}/command/sync")
def sync_production_command(
    production_id: int,
    request: SyncProductionCommandRequest,
    db: Session = Depends(get_db),
):
    """Upsert the implicit command for a production and return its enriched summary."""
    try:
        return ProductionCommandService.sync_command(
            db=db,
            production_id=production_id,
            items=[{"bom_revision_id": i.bom_revision_id, "quantity": i.quantity} for i in request.items],
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:  # pragma: no cover - defensive
        raise HTTPException(status_code=500, detail=f"Error syncing production command: {exc}")


@router.get("/productions/{production_id}/command")
def get_production_command(production_id: int, db: Session = Depends(get_db)):
    """Return the implicit command summary (with received quantities)."""
    try:
        command = ProductionCommandService.get_or_create_command(db, production_id)
        return ProductionCommandService.summary_with_receipts(db, command.id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.put("/commands/{command_id}/receipts")
def set_receipt(command_id: int, request: SetReceiptRequest, db: Session = Depends(get_db)):
    """Set the received quantity for one command line."""
    value = ProductionCommandService.set_receipt(db, command_id, request.line_key, request.qty_received)
    return {"command_id": command_id, "line_key": request.line_key, "qty_received": value}


@router.put("/commands/{command_id}/line-details")
def set_line_detail(command_id: int, request: SetLineDetailRequest, db: Session = Depends(get_db)):
    """Upsert the manual completion of one command line (MPN, note, qty, offre)."""
    try:
        return ProductionCommandService.set_line_detail(
            db,
            command_id,
            request.line_key,
            mpn=request.mpn,
            quantity_to_order=request.quantity_to_order,
            note=request.note,
            supplier=request.supplier,
            supplier_part=request.supplier_part,
            unit_price=request.unit_price,
            currency=request.currency,
            product_url=request.product_url,
            component_library_id=request.component_library_id,
            selected_supplier=request.selected_supplier,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
