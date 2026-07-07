"""Bus d'événements en mémoire (ADR 0013, phase 4 — temps réel).

Journal d'événements horodatés avec numéro de séquence croissant. Les producteurs
(endpoints d'écriture) appellent ``publish(topic, data)`` ; l'endpoint SSE lit les
nouveaux événements via ``events_since(seq, topics)`` en interrogeant le journal à
intervalle court. Ce design évite les files asyncio partagées entre le threadpool
(endpoints ``def``) et la boucle événementielle : tout passe par une simple liste
protégée par un verrou.

État volontairement **en mémoire** (backend LAN mono-process) ; perdu au redémarrage,
ce qui est acceptable (les clients se resynchronisent en rechargeant leurs données).
"""

from __future__ import annotations

import threading
import time
from typing import Iterable, List

_LOCK = threading.Lock()
_EVENTS: List[dict] = []
_SEQ = 0
# Anneau borné : on ne garde que les derniers événements (les clients pollent souvent).
_MAX_EVENTS = 500


def publish(topic: str, data: dict | None = None) -> int:
    """Ajoute un événement au journal et retourne son numéro de séquence."""
    global _SEQ
    with _LOCK:
        _SEQ += 1
        _EVENTS.append({"seq": _SEQ, "ts": time.time(), "topic": topic, "data": data or {}})
        overflow = len(_EVENTS) - _MAX_EVENTS
        if overflow > 0:
            del _EVENTS[:overflow]
        return _SEQ


def current_seq() -> int:
    with _LOCK:
        return _SEQ


def events_since(after_seq: int, topics: Iterable[str]) -> List[dict]:
    """Événements de séquence > after_seq dont le topic est dans ``topics``."""
    topic_set = set(topics)
    with _LOCK:
        return [e for e in _EVENTS if e["seq"] > after_seq and e["topic"] in topic_set]
