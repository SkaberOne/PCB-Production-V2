"""Physical component stock endpoints (ADR 0010, Phase 1).

Mounted under ``/api/marketplace`` so the public paths are ``/api/marketplace/stock/...``.
The auto IN on reception lives in ``ProductionCommandService.set_receipt`` (the single
write path for ``CommandReceipt``), not here.
"""

from typing import List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.bom import Component
from ..models.stock import StockSens
from ..schemas.stock import (
    CanProduceOut,
    ComponentParamsRequest,
    ComponentStockOut,
    GlobalSettingsRequest,
    ProjectsRootRequest,
    MovementCreateRequest,
    MovementOut,
    ReceptionCreateRequest,
    ReceptionOut,
    RecentMovementOut,
    SettingsOut,
    StockLineOut,
)
from ..services.stock_service import StockService, _UNSET
from ..services.production_stock_service import ProductionStockService
from ..services import event_bus

router = APIRouter(tags=["stock"])


def workstation_header(
    x_workstation: Optional[str] = Header(default=None, alias="X-Workstation"),
) -> Optional[str]:
    """Identité de poste déclarative (ADR 0015). Absente = ``None`` (compatible)."""
    value = (x_workstation or "").strip()
    return value[:60] or None


@router.get("/stock/can-produce/{production_id}", response_model=CanProduceOut)
def can_produce(
    production_id: int,
    boards: Optional[int] = Query(default=None, ge=0),
    db: Session = Depends(get_db),
):
    """« Puis-je produire ? » : besoin vs stock disponible (− réservé) + manques."""
    try:
        return ProductionStockService.can_i_produce(db, production_id, boards)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/stock", response_model=List[StockLineOut])
def list_stock(db: Session = Depends(get_db)):
    """Library components + balance + breakdown + status (OK / bas / manque)."""
    return StockService.list_stock(db)


class _VerifyBatchRequest(BaseModel):
    component_ids: List[int]


def _verify_out(row) -> dict:
    return {
        "component_id": row.component_id,
        "verified_at": row.verified_at.isoformat() if row.verified_at else None,
        "verified_qty": row.verified_qty,
    }


@router.post("/stock/{component_id}/verify")
def verify_stock(component_id: int, db: Session = Depends(get_db)):
    """Marque la quantité stock du composant comme vérifiée (version A : ne touche pas au solde)."""
    out = _verify_out(StockService.set_verified(db, component_id, True))
    event_bus.publish("stock", {"kind": "verify", "component_id": component_id})
    return out


@router.delete("/stock/{component_id}/verify")
def unverify_stock(component_id: int, db: Session = Depends(get_db)):
    """Annule la vérification d'un composant."""
    out = _verify_out(StockService.set_verified(db, component_id, False))
    event_bus.publish("stock", {"kind": "unverify", "component_id": component_id})
    return out


@router.post("/stock/verify-batch")
def verify_stock_batch(request: _VerifyBatchRequest, db: Session = Depends(get_db)):
    """Marque plusieurs composants comme vérifiés (« Tout valider » en Revue BOM)."""
    verified = StockService.verify_batch(db, request.component_ids)
    event_bus.publish("stock", {"kind": "verify_batch", "count": verified})
    return {"verified": verified}


@router.get("/stock/settings", response_model=SettingsOut)
def get_settings(db: Session = Depends(get_db)):
    return StockService.get_settings(db)


@router.put("/stock/settings", response_model=SettingsOut)
def update_settings(request: GlobalSettingsRequest, db: Session = Depends(get_db)):
    out = StockService.set_global_loss_pct(db, request.global_loss_pct)
    event_bus.publish("stock", {"kind": "settings"})
    return out


@router.put("/stock/projects-root", response_model=SettingsOut)
def update_projects_root(request: ProjectsRootRequest, db: Session = Depends(get_db)):
    """Configure le chemin racine des projets pour l'import catalogue (011)."""
    out = StockService.set_projects_root_path(db, request.projects_root_path)
    event_bus.publish("stock", {"kind": "settings"})
    return out


@router.post("/stock/movements", response_model=ComponentStockOut)
def create_movement(
    request: MovementCreateRequest,
    db: Session = Depends(get_db),
    created_by: Optional[str] = Depends(workstation_header),
):
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
            created_by=created_by,
        )
    elif request.motif == "reception":
        if not request.qty or request.qty <= 0:
            raise HTTPException(
                status_code=422, detail="qty > 0 requis pour une réception"
            )
        stock = StockService.post_manual_reception(
            db,
            component_id=request.component_id,
            qty=request.qty,
            note=request.note,
            created_by=created_by,
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
            created_by=created_by,
        )
    event_bus.publish("stock", {"kind": "movement", "component_id": request.component_id, "motif": request.motif})
    return stock


@router.post("/stock/receptions", response_model=ReceptionOut)
def create_reception(
    request: ReceptionCreateRequest,
    db: Session = Depends(get_db),
    created_by: Optional[str] = Depends(workstation_header),
):
    """Réception manuelle, composant existant ou **créé à la volée** (ADR 0015).

    ``new_component`` : d'abord recherche par MPN exact (insensible à la casse)
    pour éviter les doublons ; sinon création via ``get_or_create_component``.
    """
    component_created = False
    if request.component_id is not None:
        component = db.get(Component, request.component_id)
        if component is None:
            raise HTTPException(status_code=404, detail="Composant introuvable")
    else:
        payload = request.new_component
        mpn = payload.mpn.strip()
        component = (
            db.query(Component)
            .filter(func.upper(Component.mpn) == mpn.upper())
            .first()
        )
        if component is None:
            component = StockService.get_or_create_component(
                db,
                value=(payload.value or "").strip() or None,
                mpn=mpn,
                footprint_eagle=(payload.footprint or "").strip() or None,
                footprint_pnp=(payload.footprint or "").strip() or None,
                component_type=(payload.component_type or "").strip() or None,
                description=(payload.description or "").strip() or None,
            )
            component_created = True
    stock = StockService.post_manual_reception(
        db,
        component_id=component.id,
        qty=request.qty,
        note=request.note,
        created_by=created_by,
    )
    event_bus.publish(
        "stock",
        {"kind": "movement", "component_id": component.id, "motif": "reception"},
    )
    return {
        "component": component,
        "component_created": component_created,
        "stock": stock,
    }


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
    out = StockService.set_component_params(
        db,
        component_id,
        safety_stock=request.safety_stock,
        loss_pct=(request.loss_pct if "loss_pct" in fields else _UNSET),
    )
    event_bus.publish("stock", {"kind": "params", "component_id": component_id})
    return out


@router.get("/stock/{component_id}/journal", response_model=List[MovementOut])
def get_journal(component_id: int, db: Session = Depends(get_db)):
    if db.get(Component, component_id) is None:
        raise HTTPException(status_code=404, detail="Composant introuvable")
    return StockService.get_journal(db, component_id)


@router.get("/stock/movements/recent", response_model=List[RecentMovementOut])
def recent_movements(
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """Derniers mouvements de stock actifs (hors annulations), avec le libellé du
    composant — alimente la liste « Réceptions récentes » annulable."""
    out = []
    for mv, comp in StockService.get_recent_movements(db, limit):
        signed = mv.qty if mv.sens == StockSens.IN else -mv.qty
        out.append({
            "id": mv.id,
            "component_id": mv.component_id,
            "reference": comp.reference,
            "value": comp.value,
            "mpn": comp.mpn,
            "sens": mv.sens,
            "qty": mv.qty,
            "signed_qty": signed,
            "motif": mv.motif,
            "date": mv.date,
            "note": mv.note,
            "created_by": mv.created_by,
        })
    return out


@router.post("/stock/movements/{movement_id}/cancel", response_model=ComponentStockOut)
def cancel_movement(
    movement_id: int,
    db: Session = Depends(get_db),
):
    """Reversible cancel (appends an inverse movement, never deletes)."""
    try:
        movement = StockService.cancel_movement(db, movement_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return StockService.get_or_create_stock(db, movement.component_id)
