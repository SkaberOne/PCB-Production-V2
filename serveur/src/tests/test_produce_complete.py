"""Clôture de production à la déclaration de lot (complete_production)."""

from src.models.production import Production

from .conftest import TestingSessionLocal, client


def _make_production(db, name):
    prod = Production(name=name, status=Production.StatusEnum.ACTIVE)
    db.add(prod)
    db.commit()
    db.refresh(prod)
    return prod


def test_produce_with_complete_marks_production_completed():
    db = TestingSessionLocal()
    prod = _make_production(db, "CLOT-Complete")
    pid = prod.id
    db.close()

    res = client.post(
        f"/api/marketplace/productions/{pid}/produce",
        json={"boards_produced": 10, "complete_production": True},
    )
    assert res.status_code == 200

    db = TestingSessionLocal()
    assert db.get(Production, pid).status == Production.StatusEnum.COMPLETED
    db.close()

    # Quitte la liste « en cours » par défaut, présente avec include_finished.
    names = [p["name"] for p in client.get("/api/reports/productions-summary").json()]
    assert "CLOT-Complete" not in names
    names_all = [
        p["name"]
        for p in client.get(
            "/api/reports/productions-summary?include_finished=true"
        ).json()
    ]
    assert "CLOT-Complete" in names_all


def test_produce_without_complete_keeps_production_active():
    db = TestingSessionLocal()
    prod = _make_production(db, "CLOT-Partiel")
    pid = prod.id
    db.close()

    res = client.post(
        f"/api/marketplace/productions/{pid}/produce",
        json={"boards_produced": 3},
    )
    assert res.status_code == 200
    db = TestingSessionLocal()
    assert db.get(Production, pid).status == Production.StatusEnum.ACTIVE
    db.close()
