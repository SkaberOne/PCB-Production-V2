"""Marketplace command CRUD endpoints."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas.marketplace import (
    AddCommandItemRequest,
    CommandResponse,
    CreateCommandRequest,
    ExportCommandErpRequest,
    GenerateCommandRequest,
    UpdateCommandItemQuantityRequest,
    UpdateCommandRequest,
)
from ..services.command_service import CommandService

router = APIRouter()


@router.post("", response_model=CommandResponse)
def create_command(
    request: CreateCommandRequest,
    db: Session = Depends(get_db),
):
    """Create a new production command."""
    try:
        return CommandService.create_command(
            db=db,
            name=request.name,
            notes=request.notes,
            production_id=request.production_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error creating command: {exc}")


@router.post("/generate")
def generate_command(
    request: GenerateCommandRequest,
    db: Session = Depends(get_db),
):
    """Create a command with all selected BOM revisions and return its summary."""
    try:
        command = CommandService.create_command_with_items(
            db=db,
            name=request.name,
            notes=request.notes,
            production_id=request.production_id,
            items=[
                {
                    "bom_revision_id": item.bom_revision_id,
                    "quantity": item.quantity,
                }
                for item in request.items
            ],
        )
        return CommandService.get_command_summary(db=db, command_id=command.id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error generating command: {exc}")


@router.get("/{command_id}", response_model=CommandResponse)
def get_command(
    command_id: int,
    db: Session = Depends(get_db),
):
    """Get command by ID."""
    command = CommandService.get_command_by_id(db=db, command_id=command_id)
    if not command:
        raise HTTPException(status_code=404, detail=f"Command {command_id} not found")
    return command


@router.get("")
def list_commands(
    status: Optional[str] = Query(None),
    production_id: Optional[int] = Query(None, gt=0),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """List commands with optional filtering and search."""
    try:
        if search:
            commands, total = CommandService.search_commands(
                db=db,
                search_term=search,
                production_id=production_id,
                limit=limit,
                offset=offset,
            )
        else:
            commands, total = CommandService.list_commands(
                db=db,
                status_filter=status,
                production_id=production_id,
                limit=limit,
                offset=offset,
            )

        return {
            "data": commands,
            "total": total,
            "limit": limit,
            "offset": offset,
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error listing commands: {exc}")


@router.get("/{command_id}/summary")
def get_command_summary(
    command_id: int,
    db: Session = Depends(get_db),
):
    """Get detailed summary of a command including items and statistics."""
    try:
        return CommandService.get_command_summary(db=db, command_id=command_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error getting summary: {exc}")


@router.post("/{command_id}/erp-export")
def export_command_erp(
    command_id: int,
    request: ExportCommandErpRequest,
    db: Session = Depends(get_db),
):
    """Export a command as an ERP purchase-list workbook."""
    try:
        workbook_stream, filename = CommandService.export_command_erp_workbook(
            db=db,
            command_id=command_id,
            project=request.project,
            erp_status=request.erp_status,
            delay=request.delay,
            remark=request.remark,
            validator=request.validator,
            default_supplier=request.default_supplier,
            line_overrides={
                str(item.get("key")): int(item.get("quantity_to_order") or 0)
                for item in (request.line_overrides or [])
                if item.get("key") is not None
            },
        )
        headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
        return StreamingResponse(
            workbook_stream,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers=headers,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error exporting ERP workbook: {exc}")


@router.put("/{command_id}", response_model=CommandResponse)
def update_command(
    command_id: int,
    request: UpdateCommandRequest,
    db: Session = Depends(get_db),
):
    """Update command information."""
    try:
        return CommandService.update_command(
            db=db,
            command_id=command_id,
            name=request.name,
            status=request.status,
            notes=request.notes,
            notes_provided="notes" in getattr(request, "__fields_set__", set()),
        )
    except HTTPException:
        raise
    except ValueError as exc:
        detail = str(exc)
        status_code = 404 if detail.endswith("not found") else 400
        raise HTTPException(status_code=status_code, detail=detail)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error updating command: {exc}")


@router.post("/{command_id}/items")
def add_command_item(
    command_id: int,
    request: AddCommandItemRequest,
    db: Session = Depends(get_db),
):
    """Add a BOM revision to a command with specified quantity."""
    try:
        item = CommandService.add_item_to_command(
            db=db,
            command_id=command_id,
            bom_revision_id=request.bom_revision_id,
            quantity=request.quantity,
        )
        return {"message": "Item added successfully", "item_id": item.id}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error adding item: {exc}")


@router.put("/{command_id}/items/{bom_revision_id}")
def update_command_item_quantity(
    command_id: int,
    bom_revision_id: int,
    request: UpdateCommandItemQuantityRequest,
    db: Session = Depends(get_db),
):
    """Update the quantity for a command item."""
    try:
        item = CommandService.update_item_quantity(
            db=db,
            command_id=command_id,
            bom_revision_id=bom_revision_id,
            new_quantity=request.quantity,
        )
        return {"message": "Quantity updated", "new_quantity": item.quantity_to_produce}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error updating quantity: {exc}")


@router.delete("/{command_id}/items/{bom_revision_id}")
def remove_command_item(
    command_id: int,
    bom_revision_id: int,
    db: Session = Depends(get_db),
):
    """Remove a BOM from a command."""
    try:
        removed = CommandService.remove_item_from_command(
            db=db,
            command_id=command_id,
            bom_revision_id=bom_revision_id,
        )
        if not removed:
            raise HTTPException(status_code=404, detail="Item not found in command")
        return {"message": "Item removed successfully"}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error removing item: {exc}")


@router.post("/{command_id}/duplicate")
def duplicate_command(
    command_id: int,
    new_name: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
):
    """Duplicate a command (copy all items to new command)."""
    try:
        new_command = CommandService.duplicate_command(
            db=db,
            source_command_id=command_id,
            new_name=new_name,
        )
        return {"message": "Command duplicated", "new_command_id": new_command.id}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error duplicating command: {exc}")


@router.delete("/{command_id}")
def delete_command(
    command_id: int,
    db: Session = Depends(get_db),
):
    """Delete a command."""
    try:
        deleted = CommandService.delete_command(db=db, command_id=command_id)
        if not deleted:
            raise HTTPException(status_code=404, detail=f"Command {command_id} not found")
        return {"message": "Command deleted successfully"}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error deleting command: {exc}")
