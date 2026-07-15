"""Endpoint agrégé du dashboard : GET /api/reports/productions-summary."""

from src.models.production import Production, ProductionRun

from .conftest import TestingSessionLocal, client


def _make_production(db, name, status=Production.StatusEnum.ACTIVE):
    prod = Production(name=name, status=status)
    db.add(prod)
    db.commit()
    db.refresh(prod)
    return prod


def test_summary_lists_only_in_progress_by_default():
    db = TestingSessionLocal()
    active = _make_production(db, "SUM-Active")
    active_id = active.id
    _make_production(db, "SUM-Archivee", status=Production.StatusEnum.ARCHIVED)
    db.close()

    res = client.get("/api/reports/productions-summary")
    assert res.status_code == 200
    names = [p["name"] for p in res.json()]
    assert "SUM-Active" in names
    assert "SUM-Archivee" not in names

    res_all = client.get("/api/reports/productions-summary?include_finished=true")
    names_all = [p["name"] for p in res_all.json()]
    assert "SUM-Archivee" in names_all

    entry = next(p for p in res.json() if p["id"] == active_id)
    for key in (
        "status",
        "machine",
        "revisions_count",
        "boards_target",
        "boards_produced",
        "stock",
        "command",
        "presence_count",
    ):
        assert key in entry
    assert entry["status"] == "ACTIVE"
    assert entry["revisions_count"] == 0
    assert entry["presence_count"] == 0


def test_summary_counts_boards_produced_excluding_cancelled_runs():
    db = TestingSessionLocal()
    prod = _make_production(db, "SUM-Runs")
    db.add(ProductionRun(production_id=prod.id, boards_produced=12))
    db.add(ProductionRun(production_id=prod.id, boards_produced=8))
    db.add(ProductionRun(production_id=prod.id, boards_produced=99, is_cancelled=True))
    db.commit()
    pid = prod.id
    db.close()

    res = client.get("/api/reports/productions-summary")
    entry = next(p for p in res.json() if p["id"] == pid)
    assert entry["boards_produced"] == 20
