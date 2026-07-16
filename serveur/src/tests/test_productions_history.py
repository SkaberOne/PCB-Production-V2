"""Historique des productions terminées : GET /api/reports/productions-history."""

from src.models.production import Production

from .conftest import TestingSessionLocal, client


def _make(db, name):
    p = Production(name=name, status=Production.StatusEnum.ACTIVE)
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


def test_history_lists_completed_with_date_and_boards():
    db = TestingSessionLocal()
    pid = _make(db, "HIST-1").id
    db.close()
    # Déclarer un lot ET clôturer la production.
    res = client.post(
        f"/api/marketplace/productions/{pid}/produce",
        json={"boards_produced": 12, "complete_production": True},
    )
    assert res.status_code == 200

    hist = client.get("/api/reports/productions-history")
    assert hist.status_code == 200
    entry = next(r for r in hist.json() if r["id"] == pid)
    assert entry["name"] == "HIST-1"
    assert entry["boards_produced"] == 12
    assert entry["date_fin"] is not None


def test_history_excludes_non_completed():
    db = TestingSessionLocal()
    pid = _make(db, "HIST-EN-COURS").id
    db.close()
    rows = client.get("/api/reports/productions-history").json()
    assert all(r["id"] != pid for r in rows)


def test_history_limit():
    res = client.get("/api/reports/productions-history?limit=5")
    assert res.status_code == 200
    assert len(res.json()) <= 5
