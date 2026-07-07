"""Flux d'événements temps réel (ADR 0013 phase 4) — Server-Sent Events.

Monté sous ``/api/marketplace`` -> ``GET /api/marketplace/events?topics=stock``.
Le client (fetch + ReadableStream, pour pouvoir envoyer l'en-tête X-API-Key) reçoit
un flux SSE ; à chaque événement ``stock`` il rafraîchit ses données.
"""

import asyncio
import json

from fastapi import APIRouter, Query, Request
from starlette.responses import StreamingResponse

from ..services import event_bus

router = APIRouter(tags=["events"])

# Intervalle d'interrogation interne du journal + heartbeat (garde la connexion vivante
# à travers proxys). Latence perçue ≈ POLL_INTERVAL.
POLL_INTERVAL = 1.5


@router.get("/events")
async def events_stream(request: Request, topics: str = Query("stock")):
    """Flux SSE des événements pour les topics demandés (séparés par des virgules)."""
    topic_set = [t.strip() for t in topics.split(",") if t.strip()] or ["stock"]

    async def generator():
        last_seq = event_bus.current_seq()
        # Commentaire initial : ouvre le flux immédiatement côté client.
        yield ": connected\n\n"
        while True:
            if await request.is_disconnected():
                break
            for evt in event_bus.events_since(last_seq, topic_set):
                last_seq = evt["seq"]
                payload = json.dumps(evt["data"])
                yield f"event: {evt['topic']}\ndata: {payload}\n\n"
            # Heartbeat (commentaire SSE) pour maintenir la connexion ouverte.
            yield ": ping\n\n"
            await asyncio.sleep(POLL_INTERVAL)

    return StreamingResponse(
        generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
