"""Suivi manuel des productions terminées : compteurs cartes + note.

PATCH /api/marketplace/productions/{id}/followup, exposé aussi dans
/api/reports/productions-history.
"""

from src.models.production import Production

from .conftest import TestingSessionLocal, client


def _make_completed(db, name):
    p = Production(name=name, status=Production.StatusEnum.COMPLETED)
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


def _history_entry(pid):
    return next(r for r in client.get("/api/reports/productions-history").json() if r["id"] == pid)


def test_followup_defaults_zero_and_exposed_in_history():
    db = TestingSessionLocal()
    pid = _make_completed(db, "SUIVI-1").id
    db.close()
    e = _history_entry(pid)
    assert e["cards_tested"] == 0
    assert e["cards_validated"] == 0
    assert e["cards_to_debug"] == 0
    assert e["followup_note"] is None


def test_update_followup_sets_all_fields():
    db = TestingSessionLocal()
    pid = _make_completed(db, "SUIVI-2").id
    db.close()
    res = client.patch(
        f"/api/marketplace/productions/{pid}/followup",
        json={"cards_tested": 12, "cards_validated": 10, "cards_to_debug": 2, "note": "C3 HS"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["cards_tested"] == 12
    assert body["cards_validated"] == 10
    assert body["cards_to_debug"] == 2
    assert body["followup_note"] == "C3 HS"
    e = _history_entry(pid)
    assert e["cards_validated"] == 10
    assert e["followup_note"] == "C3 HS"


def test_update_followup_partial_keeps_others():
    db = TestingSessionLocal()
    pid = _make_completed(db, "SUIVI-3").id
    db.close()
    client.patch(f"/api/marketplace/productions/{pid}/followup", json={"cards_tested": 5})
    client.patch(f"/api/marketplace/productions/{pid}/followup", json={"note": "ok"})
    e = _history_entry(pid)
    assert e["cards_tested"] == 5  # conservé
    assert e["followup_note"] == "ok"


def test_update_followup_negative_rejected():
    db = TestingSessionLocal()
    pid = _make_completed(db, "SUIVI-4").id
    db.close()
    res = client.patch(
        f"/api/marketplace/productions/{pid}/followup",
        json={"cards_tested": -3},
    )
    assert res.status_code == 422


def test_update_followup_unknown_404():
    res = client.patch(
        "/api/marketplace/productions/999999/followup",
        json={"cards_tested": 1},
    )
    assert res.status_code == 404
