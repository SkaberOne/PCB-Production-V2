"""Marketplace production workspace routes."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.production import Production
from ..schemas.marketplace import (
    AttachProductionBomRequest,
    CreateProductionRequest,
    UpdateErpContextRequest,
    UpdateProductionBomQuantitiesRequest,
    UpdateProductionRequest,
)
from ..services.production_workspace_service import ProductionWorkspaceService


def _build_duplicate_name(db: Session, source_name: str) -> str:
    """Return a unique name for a duplicated production (``Copie de ...``)."""
    base = f"Copie de {source_name}"
    candidate = base
    suffix = 2
    while db.query(Production.id).filter(Production.name == candidate).first():
        candidate = f"{base} ({suffix})"
        suffix += 1
    return candidate


router = APIRouter(prefix="/productions")


@router.post("")
def create_production(
    request: CreateProductionRequest,
    db: Session = Depends(get_db),
):
    """Create a user-managed production workspace."""
    try:
        return ProductionWorkspaceService.create_production(
            db=db,
            name=request.name,
            machine_id=request.machine_id,
            notes=request.notes,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating production: {str(e)}")


@router.delete("/{production_id}")
def delete_production(
    production_id: int,
    db: Session = Depends(get_db),
):
    """Delete a production workspace and its BOM links."""
    try:
        ProductionWorkspaceService.delete_production(db=db, production_id=production_id)
        return {"status": "deleted", "id": production_id}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting production: {str(e)}")


@router.post("/{production_id}/duplicate")
def duplicate_production(
    production_id: int,
    db: Session = Depends(get_db),
):
    """Duplicate a production workspace under a new unique name."""
    try:
        source = ProductionWorkspaceService.get_production_or_raise(db, production_id)
        new_name = _build_duplicate_name(db, source.name)
        return ProductionWorkspaceService.duplicate_production(
            db=db,
            production_id=production_id,
            new_name=new_name,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error duplicating production: {str(e)}")


@router.get("")
def list_productions(
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """List existing productions with their linked BOM count."""
    try:
        return {
            "items": ProductionWorkspaceService.list_productions(db=db, search=search),
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error listing productions: {str(e)}")


@router.get("/{production_id}")
def get_production_detail(
    production_id: int,
    db: Session = Depends(get_db),
):
    """Return a production workspace with its linked BOM revisions."""
    try:
        return ProductionWorkspaceService.get_production_detail(db=db, production_id=production_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting production: {str(e)}")


@router.patch("/{production_id}")
def update_production(
    production_id: int,
    request: UpdateProductionRequest,
    db: Session = Depends(get_db),
):
    """Rename or update the status of a production workspace."""
    try:
        return ProductionWorkspaceService.update_production(
            db=db,
            production_id=production_id,
            name=request.name,
            machine_id=request.machine_id,
            machine_id_provided="machine_id" in getattr(request, "__fields_set__", set()),
            status=request.status,
            notes=request.notes,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating production: {str(e)}")


@router.post("/{production_id}/bom-revisions")
def attach_bom_revisions_to_production(
    production_id: int,
    request: AttachProductionBomRequest,
    db: Session = Depends(get_db),
):
    """Attach one or more stored BOM revisions to a production workspace."""
    try:
        return ProductionWorkspaceService.attach_bom_revisions(
            db=db,
            production_id=production_id,
            bom_revision_ids=request.bom_revision_ids,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error attaching BOMs to production: {str(e)}")


@router.post("/{production_id}/bom-revisions/detach")
def detach_bom_revisions_from_production(
    production_id: int,
    request: AttachProductionBomRequest,
    db: Session = Depends(get_db),
):
    """Detach one or more stored BOM revisions from a production workspace."""
    try:
        return ProductionWorkspaceService.detach_bom_revisions(
            db=db,
            production_id=production_id,
            bom_revision_ids=request.bom_revision_ids,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error detaching BOMs from production: {str(e)}")


@router.patch("/{production_id}/bom-quantities")
def update_production_bom_quantities(
    production_id: int,
    request: UpdateProductionBomQuantitiesRequest,
    db: Session = Depends(get_db),
):
    """Persist the board quantity to produce for linked BOM revisions."""
    try:
        return ProductionWorkspaceService.update_bom_revision_quantities(
            db=db,
            production_id=production_id,
            quantity_items=[
                {
                    "bom_revision_id": item.bom_revision_id,
                    "quantity_to_produce": item.quantity_to_produce,
                }
                for item in request.items
            ],
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating production BOM quantities: {str(e)}")


@router.patch("/{production_id}/erp-context")
def update_production_erp_context(
    production_id: int,
    request: UpdateErpContextRequest,
    db: Session = Depends(get_db),
):
    """Persist the ERP export context fields for a production workspace."""
    try:
        return ProductionWorkspaceService.update_erp_context(
            db=db,
            production_id=production_id,
            erp_context=request.erp_context,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating ERP context: {str(e)}")
