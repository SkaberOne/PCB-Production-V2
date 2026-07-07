"""Tests vérification physique du stock (ADR 0013 phase 1, version A).

Couvre : marquer vérifié (POST), la valeur remonte dans GET /stock (verified_at +
verified_qty = solde), annuler (DELETE), et le lot (verify-batch).
"""

from .conftest import client, TestingSessionLocal

from src.models.bom import Component
from src.services.stock_service import StockService


def _make_component(db, value="100nF", ctype="CAPACITOR"):
    comp = Component(reference=f"LIB-{value}", value=value, component_type=ctype)
    db.add(comp)
    db.commit()
    db.refresh(comp)
    return comp


def _stock_line(component_id):
    rows = client.get("/api/marketplace/stock").json()
    return next((r for r in rows if r["component_id"] == component_id), None)


def test_verify_marks_and_records_qty():
    db = TestingSessionLocal()
    comp = _make_component(db)
    StockService.post_declaration(db, comp.id, qty_reel=250)
    comp_id = comp.id
    db.close()

    line = _stock_line(comp_id)
    assert line["verified_at"] is None

    res = client.post(f"/api/marketplace/stock/{comp_id}/verify")
    assert res.status_code == 200
    body = res.json()
    assert body["verified_at"] is not None
    assert body["verified_qty"] == 250

    line = _stock_line(comp_id)
    assert line["verified_at"] is not None
    assert line["verified_qty"] == 250


def test_unverify_clears():
    db = TestingSessionLocal()
    comp = _make_component(db, value="10K", ctype="RESISTOR")
    comp_id = comp.id
    db.close()

    client.post(f"/api/marketplace/stock/{comp_id}/verify")
    res = client.delete(f"/api/marketplace/stock/{comp_id}/verify")
    assert res.status_code == 200
    assert res.json()["verified_at"] is None
    assert _stock_line(comp_id)["verified_at"] is None


def test_verify_batch():
    db = TestingSessionLocal()
    ids = [_make_component(db, value=f"C{i}").id for i in range(3)]
    db.close()

    res = client.post("/api/marketplace/stock/verify-batch", json={"component_ids": ids})
    assert res.status_code == 200
    assert res.json()["verified"] == 3
    for cid in ids:
        assert _stock_line(cid)["verified_at"] is not None
