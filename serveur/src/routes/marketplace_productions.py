"""Marketplace production workspace routes."""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
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
from ..schemas.stock import ProduceRequest, RunOut, RunUpdateRequest
from ..services.production_stock_service import ProductionStockService
from ..services.production_workspace_service import ProductionWorkspaceService
from ..services import event_bus
from .marketplace_stock import workstation_header


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
            assembly_mode=request.assembly_mode,
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
    # Concurrence optimiste opt-in (ADR 0013 extension B) : si le client fournit
    # une version et qu'elle diffère de la base, un autre poste a modifié entre-temps.
    if request.version is not None:
        db_prod = db.get(Production, production_id)
        if (
            db_prod is not None
            and db_prod.version is not None
            and db_prod.version != request.version
        ):
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "version_conflict",
                    "message": "Cette production a été modifiée par un autre poste depuis votre ouverture. Rechargez pour voir la version à jour.",
                    "current": ProductionWorkspaceService.get_production_detail(db, production_id),
                },
            )
    try:
        return ProductionWorkspaceService.update_production(
            db=db,
            production_id=production_id,
            name=request.name,
            machine_id=request.machine_id,
            machine_id_provided="machine_id" in getattr(request, "__fields_set__", set()),
            status=request.status,
            notes=request.notes,
            assembly_mode=request.assembly_mode,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating production: {str(e)}")


@router.post("/{production_id}/produce", response_model=RunOut)
def produce_production(
    production_id: int,
    request: ProduceRequest,
    db: Session = Depends(get_db),
    created_by: Optional[str] = Depends(workstation_header),
):
    """Déclarer un lot produit depuis le dashboard — machine **optionnelle**.

    ``machine_id`` absent/None = cartes assemblées à la main. Crée un
    ``ProductionRun`` + sortie stock auto (ADR 0011), annulable, tracé par
    poste (ADR 0015).
    """
    if db.get(Production, production_id) is None:
        raise HTTPException(status_code=404, detail="Production introuvable")
    try:
        run = ProductionStockService.produce(
            db=db,
            production_id=production_id,
            machine_id=request.machine_id,
            boards_produced=request.boards_produced,
            note=request.note,
            created_by=created_by,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if request.complete_production:
        # Clôture : quitte « en cours » (dashboard) + libère les réservations
        # de stock des autres productions (ADR 0011, _ACTIVE_STATUSES).
        ProductionWorkspaceService.update_production(
            db=db, production_id=production_id, status="COMPLETED"
        )
    event_bus.publish("stock", {"kind": "produce", "production_id": production_id})
    return run


@router.get("/{production_id}/runs", response_model=List[RunOut])
def list_production_runs(production_id: int, db: Session = Depends(get_db)):
    """Liste les lots déclarés d'une production (récents d'abord), pour les
    consulter / corriger depuis le dashboard."""
    if db.get(Production, production_id) is None:
        raise HTTPException(status_code=404, detail="Production introuvable")
    return ProductionStockService.list_runs(db, production_id)


@router.patch("/{production_id}/runs/{run_id}", response_model=RunOut)
def update_production_run(
    production_id: int,
    run_id: int,
    request: RunUpdateRequest,
    db: Session = Depends(get_db),
):
    """Corrige le nombre de cartes d'un lot déjà déclaré. **Remplace** (ne
    s'additionne pas) : la sortie stock du lot est réconciliée (ADR 0011)."""
    try:
        run = ProductionStockService.update_run(db, run_id, request.boards_produced)
    except ValueError as e:
        code = 404 if "introuvable" in str(e).lower() else 400
        raise HTTPException(status_code=code, detail=str(e))
    event_bus.publish("stock", {"kind": "produce", "production_id": production_id})
    return run


@router.post("/{production_id}/runs/{run_id}/cancel", response_model=RunOut)
def cancel_production_run(
    production_id: int,
    run_id: int,
    db: Session = Depends(get_db),
):
    """Annule un lot déclaré (réversible : contra-passe sa sortie stock)."""
    try:
        run = ProductionStockService.cancel_run(db, run_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    event_bus.publish("stock", {"kind": "produce", "production_id": production_id})
    return run


class FollowupRequest(BaseModel):
    """Suivi manuel d'une production terminée (compteurs cartes + note libre).
    Tous les champs optionnels : seuls ceux fournis sont mis à jour."""

    cards_tested: Optional[int] = Field(default=None, ge=0)
    cards_validated: Optional[int] = Field(default=None, ge=0)
    cards_to_debug: Optional[int] = Field(default=None, ge=0)
    note: Optional[str] = Field(default=None, max_length=1000)


@router.patch("/{production_id}/followup")
def update_production_followup(
    production_id: int,
    request: FollowupRequest,
    db: Session = Depends(get_db),
):
    """Met à jour le suivi manuel d'une production (cartes testées / validées /
    à débugger + note). N'affecte ni le statut ni le stock."""
    try:
        result = ProductionWorkspaceService.update_followup(
            db,
            production_id,
            cards_tested=request.cards_tested,
            cards_validated=request.cards_validated,
            cards_to_debug=request.cards_to_debug,
            note=request.note,
            note_provided="note" in request.model_fields_set,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    event_bus.publish("stock", {"kind": "produce", "production_id": production_id})
    return result


@router.post("/{production_id}/bom-revisions")
def attach_bom_revisions_to_production(
    production_id: int,
    request: AttachProductionBomRequest,
    db: Session = Depends(get_db),
):
    """Attach one or more stored BOM revisions to a production workspace."""
    try:
        result = ProductionWorkspaceService.attach_bom_revisions(
            db=db,
            production_id=production_id,
            bom_revision_ids=request.bom_revision_ids,
        )
        event_bus.publish(f"production:{production_id}", {"kind": "bom_attach"})
        return result
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
        result = ProductionWorkspaceService.detach_bom_revisions(
            db=db,
            production_id=production_id,
            bom_revision_ids=request.bom_revision_ids,
        )
        event_bus.publish(f"production:{production_id}", {"kind": "bom_detach"})
        return result
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
        result = ProductionWorkspaceService.update_bom_revision_quantities(
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
        event_bus.publish(f"production:{production_id}", {"kind": "bom_quantities"})
        return result
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
