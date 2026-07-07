"""Tests présence par production (ADR 0013 phase 3).

Décompte des postes via heartbeat, lecture, et départ. État en mémoire : on utilise
des production_id dédiés pour éviter toute interférence avec les autres tests.
"""

from .conftest import client

HB = "/api/marketplace/presence/heartbeat"
LEAVE = "/api/marketplace/presence/leave"


def test_heartbeat_counts_distinct_sessions():
    r1 = client.post(HB, json={"production_id": 9001, "session_id": "poste-A"})
    assert r1.status_code == 200
    assert r1.json()["count"] == 1

    r2 = client.post(HB, json={"production_id": 9001, "session_id": "poste-B"})
    assert r2.json()["count"] == 2

    # Même session re-heartbeat -> toujours 2 (pas de double compte).
    r3 = client.post(HB, json={"production_id": 9001, "session_id": "poste-A"})
    assert r3.json()["count"] == 2

    g = client.get("/api/marketplace/presence/9001")
    assert g.json()["count"] == 2


def test_leave_decrements():
    client.post(HB, json={"production_id": 9002, "session_id": "a"})
    client.post(HB, json={"production_id": 9002, "session_id": "b"})
    client.post(LEAVE, json={"production_id": 9002, "session_id": "a"})
    assert client.get("/api/marketplace/presence/9002").json()["count"] == 1


def test_isolated_per_production():
    client.post(HB, json={"production_id": 9003, "session_id": "x"})
    # Une autre production n'est pas impactée.
    assert client.get("/api/marketplace/presence/9004").json()["count"] == 0
