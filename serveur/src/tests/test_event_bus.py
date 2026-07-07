"""Tests du bus d'événements temps réel (ADR 0013 phase 4).

Vérifie la publication/lecture par séquence et topic, et que les écritures stock
publient bien un événement ``stock`` (câblage des routes). Le flux SSE lui-même
(générateur infini) n'est pas testé ici — seule la logique de publication l'est.
"""

from .conftest import client, TestingSessionLocal

from src.models.bom import Component
from src.services import event_bus


def test_publish_increments_seq_and_filters_topic():
    base = event_bus.current_seq()
    s1 = event_bus.publish("stock", {"kind": "x"})
    assert s1 == base + 1

    event_bus.publish("autre", {"kind": "y"})

    stock_events = event_bus.events_since(base, ["stock"])
    assert any(e["data"].get("kind") == "x" for e in stock_events)
    # Le filtre par topic exclut les autres.
    assert all(e["topic"] == "stock" for e in stock_events)


def test_stock_write_publishes_stock_event():
    db = TestingSessionLocal()
    comp = Component(reference="LIB-EVT", value="1k")
    db.add(comp)
    db.commit()
    db.refresh(comp)
    cid = comp.id
    db.close()

    base = event_bus.current_seq()
    res = client.post(f"/api/marketplace/stock/{cid}/verify")
    assert res.status_code == 200

    new_events = event_bus.events_since(base, ["stock"])
    assert any(e["data"].get("component_id") == cid for e in new_events)
