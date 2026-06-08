"""Marketplace machine routes."""

from typing import Optional

from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas.marketplace import (
    CreateMachineRequest,
    UpdateMachineProductionBomOrderRequest,
    UpdateMachineRequest,
)
from ..services.assignment_service import AssignmentService

router = APIRouter(prefix="/machines")


@router.post("")
def create_machine(
    request: CreateMachineRequest,
    db: Session = Depends(get_db),
):
    """Create a new PnP machine."""
    try:
        machine = AssignmentService.create_machine(
            db=db,
            name=request.name,
            num_positions=request.num_positions,
            num_nozzles=request.num_nozzles,
            nozzle_layout=request.nozzle_layout,
            export_format=request.export_format,
            export_columns=request.export_columns,
            export_separator=request.export_separator,
            description=request.description,
            notes=request.notes,
        )
        return {"message": "Machine created", "machine_id": machine.id}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating machine: {str(e)}")


@router.get("/{machine_id}")
def get_machine(
    machine_id: int,
    db: Session = Depends(get_db),
):
    """Get machine by ID."""
    machine = AssignmentService.get_machine_by_id(db=db, machine_id=machine_id)
    if not machine:
        raise HTTPException(status_code=404, detail=f"Machine {machine_id} not found")
    return AssignmentService._serialize_machine(machine)


@router.get("/{machine_id}/summary")
def get_machine_summary(
    machine_id: int,
    db: Session = Depends(get_db),
):
    """Get detailed summary of machine configuration."""
    try:
        summary = AssignmentService.get_machine_summary(db=db, machine_id=machine_id)
        return summary
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting machine summary: {str(e)}")


@router.patch("/{machine_id}/productions/{production_id}/bom-order")
def update_machine_production_bom_order(
    machine_id: int,
    production_id: int,
    request: UpdateMachineProductionBomOrderRequest,
    db: Session = Depends(get_db),
):
    """Persist the manufacturing order of BOM revisions for a machine production."""
    try:
        production = AssignmentService.update_machine_production_bom_order(
            db=db,
            machine_id=machine_id,
            production_id=production_id,
            bom_revision_ids=request.bom_revision_ids,
        )
        return {
            "message": "Ordre de fabrication enregistre.",
            "production": production,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating BOM order: {str(e)}")


@router.post("/{machine_id}/productions/{production_id}/validate-order")
def validate_machine_production_order(
    machine_id: int,
    production_id: int,
    db: Session = Depends(get_db),
):
    """Validate the manufacturing sequence and return an optimized feeder plan."""
    try:
        return AssignmentService.validate_machine_production_order(
            db=db,
            machine_id=machine_id,
            production_id=production_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error validating production order: {str(e)}")


@router.get("/{machine_id}/productions/{production_id}/feeder-plan")
def get_machine_production_feeder_plan(
    machine_id: int,
    production_id: int,
    bom_revision_id: Optional[int] = Query(None, ge=1),
    db: Session = Depends(get_db),
):
    """Calculate the feeder-slot plan for a production on a machine.

    Si bom_revision_id est fourni, le plan est recalculé pour CETTE face
    (TOP/BOT) seule : implantation + composants à la main propres à la face.
    """
    try:
        return AssignmentService.get_machine_production_feeder_plan(
            db=db,
            machine_id=machine_id,
            production_id=production_id,
            bom_revision_id=bom_revision_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error calculating feeder plan: {str(e)}")


@router.get("/{machine_id}/productions/{production_id}/export")
def export_machine_production_config(
    machine_id: int,
    production_id: int,
    bom_revision_id: Optional[int] = Query(None, ge=1),
    export_format: Optional[str] = Query(None, pattern="^(CSV|TXT)$"),
    db: Session = Depends(get_db),
):
    """Génère et télécharge le fichier d'export PnP (CSV/TXT) pour le logiciel Pick&Place.

    Le format/colonnes/séparateur proviennent de la config de la machine ; `export_format`
    permet un override ponctuel. `bom_revision_id` restreint à une face (TOP/BOT).
    """
    try:
        filename, media_type, content = AssignmentService.export_machine_production_config(
            db=db,
            machine_id=machine_id,
            production_id=production_id,
            bom_revision_id=bom_revision_id,
            export_format=export_format,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error exporting PnP config: {str(e)}")

    disposition = f"attachment; filename=\"{filename}\"; filename*=UTF-8''{quote(filename)}"
    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": disposition},
    )


@router.get("")
def list_machines(
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """List all machines."""
    try:
        machines, total = AssignmentService.list_machines(
            db=db,
            limit=limit,
            offset=offset,
        )
        return {
            "data": [AssignmentService._serialize_machine(machine) for machine in machines],
            "total": total,
            "limit": limit,
            "offset": offset,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error listing machines: {str(e)}")


@router.put("/{machine_id}", response_model=dict)
def update_machine(
    machine_id: int,
    request: UpdateMachineRequest,
    db: Session = Depends(get_db),
):
    """Update machine information."""
    try:
        machine = AssignmentService.update_machine(
            db=db,
            machine_id=machine_id,
            name=request.name,
            num_positions=request.num_positions,
            num_nozzles=request.num_nozzles,
            nozzle_layout=request.nozzle_layout,
            export_format=request.export_format,
            export_columns=request.export_columns,
            export_separator=request.export_separator,
            description=request.description,
            notes=request.notes,
        )
        return {"message": "Machine updated"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating machine: {str(e)}")


@router.delete("/{machine_id}")
def delete_machine(
    machine_id: int,
    db: Session = Depends(get_db),
):
    """Delete a machine."""
    try:
        deleted = AssignmentService.delete_machine(db=db, machine_id=machine_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Machine not found")
        return {"message": "Machine deleted"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting machine: {str(e)}")


@router.get("/{machine_id}/plans/{plan_id}/capacity")
def check_machine_capacity(
    machine_id: int,
    plan_id: int,
    db: Session = Depends(get_db),
):
    """Check if a production plan fits within machine capacity."""
    try:
        capacity_check = AssignmentService.check_machine_capacity(
            db=db,
            machine_id=machine_id,
            plan_id=plan_id,
        )
        return capacity_check
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error checking capacity: {str(e)}")
