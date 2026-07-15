"""Correction d'un lot produit déjà déclaré (feature « modifier le lot »).

Couvre GET/PATCH/POST cancel sous /productions/{id}/runs. Le point clé : la
correction **remplace** le nombre de cartes (ne s'additionne pas).
"""

from src.models.production import Production, ProductionRun

from .conftest import TestingSessionLocal, client


def _make_production(db, name="LOT-Modif"):
    prod = Production(name=name, status=Production.StatusEnum.ACTIVE)
    db.add(prod)
    db.commit()
    db.refresh(prod)
    return prod


def _declare(pid, boards):
    return client.post(
        f"/api/marketplace/productions/{pid}/produce",
        json={"boards_produced": boards},
    ).json()


def _summary_boards(pid):
    summary = client.get("/api/reports/productions-summary").json()
    return next(p for p in summary if p["id"] == pid)["boards_produced"]


def test_list_runs():
    db = TestingSessionLocal()
    pid = _make_production(db).id
    db.close()
    _declare(pid, 5)
    _declare(pid, 3)
    res = client.get(f"/api/marketplace/productions/{pid}/runs")
    assert res.status_code == 200
    runs = res.json()
    assert len(runs) == 2
    assert runs[0]["boards_produced"] == 3  # récents d'abord


def test_update_run_replaces_not_adds():
    db = TestingSessionLocal()
    pid = _make_production(db).id
    db.close()
    run = _declare(pid, 5)
    assert _summary_boards(pid) == 5

    # Correction : 5 → 3. Le total doit être 3, pas 8.
    res = client.patch(
        f"/api/marketplace/productions/{pid}/runs/{run['id']}",
        json={"boards_produced": 3},
    )
    assert res.status_code == 200
    assert res.json()["boards_produced"] == 3
    assert _summary_boards(pid) == 3


def test_update_cancelled_run_400():
    db = TestingSessionLocal()
    pid = _make_production(db).id
    db.close()
    run = _declare(pid, 4)
    client.post(f"/api/marketplace/productions/{pid}/runs/{run['id']}/cancel")
    res = client.patch(
        f"/api/marketplace/productions/{pid}/runs/{run['id']}",
        json={"boards_produced": 2},
    )
    assert res.status_code == 400


def test_cancel_run_excludes_from_total():
    db = TestingSessionLocal()
    pid = _make_production(db).id
    db.close()
    run = _declare(pid, 7)
    assert _summary_boards(pid) == 7
    res = client.post(f"/api/marketplace/productions/{pid}/runs/{run['id']}/cancel")
    assert res.status_code == 200
    assert res.json()["is_cancelled"] is True
    assert _summary_boards(pid) == 0
    db = TestingSessionLocal()
    assert db.get(ProductionRun, run["id"]).is_cancelled is True
    db.close()


def test_update_unknown_run_404():
    db = TestingSessionLocal()
    pid = _make_production(db).id
    db.close()
    res = client.patch(
        f"/api/marketplace/productions/{pid}/runs/999999",
        json={"boards_produced": 1},
    )
    assert res.status_code == 404


def test_list_runs_unknown_production_404():
    res = client.get("/api/marketplace/productions/999999/runs")
    assert res.status_code == 404
