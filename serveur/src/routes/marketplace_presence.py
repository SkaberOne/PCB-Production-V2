"""Présence par production (ADR 0013 phase 3).

Monté sous ``/api/marketplace`` -> chemins publics ``/api/marketplace/presence/...``.
Sert le petit compteur « N postes sur cette production » de la Revue BOM.
"""

from fastapi import APIRouter
from pydantic import BaseModel

from ..services import presence_service

router = APIRouter(tags=["presence"])


class PresenceRequest(BaseModel):
    production_id: int
    session_id: str


@router.post("/presence/heartbeat")
def presence_heartbeat(request: PresenceRequest):
    """Rafraîchit la présence du poste et renvoie le nombre de postes actifs."""
    return presence_service.heartbeat(request.production_id, request.session_id)


@router.post("/presence/leave")
def presence_leave(request: PresenceRequest):
    """Signale le départ d'un poste (fermeture d'onglet)."""
    return presence_service.leave(request.production_id, request.session_id)


@router.get("/presence/{production_id}")
def presence_count(production_id: int):
    """Nombre de postes actuellement présents sur une production."""
    return presence_service.count_for(production_id)
