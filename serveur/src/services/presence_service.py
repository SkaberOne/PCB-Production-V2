"""Présence par production (ADR 0013, phase 3).

État volontairement **en mémoire** (le backend LAN est un process unique) : map
``production_id -> {session_id: last_seen_epoch}``. Chaque onglet navigateur envoie
un heartbeat périodique ; les sessions non revues depuis ``TTL_SECONDS`` expirent.
Aucune identité persistée (pas de traçabilité) — cf ADR 0013 §4. Perdu au redémarrage
du backend, se reconstruit aux heartbeats suivants.
"""

from __future__ import annotations

import threading
import time
from typing import Dict, List

# Un poste est considéré présent s'il a envoyé un heartbeat dans cette fenêtre.
# Doit être > à l'intervalle de heartbeat côté client (≈ 10 s) avec de la marge.
TTL_SECONDS = 30

_LOCK = threading.Lock()
_PRESENCE: Dict[int, Dict[str, float]] = {}


def _prune_locked(production_id: int, now: float) -> Dict[str, float]:
    sessions = _PRESENCE.get(production_id, {})
    expired = [sid for sid, seen in sessions.items() if now - seen > TTL_SECONDS]
    for sid in expired:
        sessions.pop(sid, None)
    if not sessions:
        _PRESENCE.pop(production_id, None)
    return sessions


def heartbeat(production_id: int, session_id: str) -> dict:
    """Enregistre/rafraîchit la présence d'un poste et retourne le décompte courant."""
    now = time.time()
    with _LOCK:
        sessions = _PRESENCE.setdefault(production_id, {})
        sessions[session_id] = now
        sessions = _prune_locked(production_id, now)
        ids = list(sessions.keys())
    return {"production_id": production_id, "count": len(ids), "sessions": ids}


def leave(production_id: int, session_id: str) -> dict:
    """Retire un poste (fermeture d'onglet). Idempotent."""
    with _LOCK:
        sessions = _PRESENCE.get(production_id)
        if sessions:
            sessions.pop(session_id, None)
            if not sessions:
                _PRESENCE.pop(production_id, None)
    return {"production_id": production_id, "ok": True}


def count_for(production_id: int) -> dict:
    """Décompte des postes présents sur une production (lecture seule)."""
    now = time.time()
    with _LOCK:
        sessions = _prune_locked(production_id, now)
        ids = list(sessions.keys())
    return {"production_id": production_id, "count": len(ids), "sessions": ids}
