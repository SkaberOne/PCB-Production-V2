"""Déclaration de lot depuis le dashboard : POST /productions/{id}/produce.

Machine optionnelle (cartes assemblées à la main) + traçabilité poste (ADR 0015).
"""

from src.models.production import Production, ProductionRun

from .conftest import TestingSessionLocal, client


def _make_production(db, name):
    prod = Production(name=name, status=Production.StatusEnum.ACTIVE)
    db.add(prod)
    db.commit()
    db.refresh(prod)
    return prod


def test_produce_without_machine_creates_manual_run():
    db = TestingSessionLocal()
    prod = _make_production(db, "LOT-Manuel")
    pid = prod.id
    db.close()

    res = client.post(
        f"/api/marketplace/productions/{pid}/produce",
        json={"boards_produced": 5, "note": "serie soudee main"},
        headers={"X-Workstation": "poste-atelier-2"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["machine_id"] is None
    assert body["boards_produced"] == 5
    assert body["created_by"] == "poste-atelier-2"

    # Compté dans le résumé dashboard.
    summary = client.get("/api/reports/productions-summary").json()
    entry = next(p for p in summary if p["id"] == pid)
    assert entry["boards_produced"] == 5


def test_produce_unknown_production_404():
    res = client.post(
        "/api/marketplace/productions/999999/produce",
        json={"boards_produced": 3},
    )
    assert res.status_code == 404


def test_produce_run_is_cancellable():
    db = TestingSessionLocal()
    prod = _make_production(db, "LOT-Annulable")
    pid = prod.id
    db.close()

    run = client.post(
        f"/api/marketplace/productions/{pid}/produce",
        json={"boards_produced": 4},
    ).json()

    # Annulation via la route machine historique (machine placeholder = 0 interdit
    # par le schéma ; la route runs/cancel accepte n'importe quel machine_id de chemin).
    res = client.post(
        f"/api/marketplace/machines/1/productions/{pid}/runs/{run['id']}/cancel",
    )
    assert res.status_code == 200
    db = TestingSessionLocal()
    db_run = db.get(ProductionRun, run["id"])
    assert db_run.is_cancelled is True
    db.close()
