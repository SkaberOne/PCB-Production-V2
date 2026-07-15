"""Réception avec création de composant + identité de poste (ADR 0015).

Couvre ``POST /api/marketplace/stock/receptions`` :
* composant existant par id ;
* composant inconnu → créé à la volée (MPN requis) ;
* dédoublonnage par MPN (insensible à la casse) ;
* ``created_by`` alimenté depuis le header ``X-Workstation`` ;
* validations (ni id ni new_component, qty <= 0).
"""

from src.models.bom import Component
from src.models.stock import StockMovement

from .conftest import TestingSessionLocal, client


def _make_component(db, value="10K", mpn="RC0402-10K", footprint="R0402"):
    comp = Component(
        reference=f"LIB-{value}-{footprint}-{mpn}",
        value=value,
        mpn=mpn,
        footprint_eagle=footprint,
        footprint_pnp=footprint,
        component_type="RESISTOR",
    )
    db.add(comp)
    db.commit()
    db.refresh(comp)
    return comp


def test_reception_existing_component_by_id():
    db = TestingSessionLocal()
    comp = _make_component(db, value="4K7", mpn="REC-EXIST-4K7")
    cid = comp.id
    db.close()
    res = client.post(
        "/api/marketplace/stock/receptions",
        json={"component_id": cid, "qty": 250},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["component_created"] is False
    assert body["component"]["id"] == cid
    assert body["stock"]["qty_pieces"] == 250


def test_reception_creates_unknown_component():
    res = client.post(
        "/api/marketplace/stock/receptions",
        json={
            "new_component": {
                "mpn": "GRM155R71C104KA88D",
                "value": "100nF",
                "footprint": "C0402",
                "component_type": "CONDO",
            },
            "qty": 1000,
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert body["component_created"] is True
    assert body["component"]["mpn"] == "GRM155R71C104KA88D"
    assert body["component"]["component_type"] == "CONDO"
    assert body["stock"]["qty_pieces"] == 1000
    db = TestingSessionLocal()
    comp = (
        db.query(Component)
        .filter(Component.mpn == "GRM155R71C104KA88D")
        .one()
    )
    assert comp.value == "100nF"
    assert comp.footprint_eagle == "C0402"
    db.close()


def test_reception_dedupes_by_mpn_case_insensitive():
    db = TestingSessionLocal()
    comp = _make_component(db, value="1uF", mpn="REC-DEDUP-1UF", footprint="C0603")
    cid = comp.id
    db.close()
    res = client.post(
        "/api/marketplace/stock/receptions",
        json={"new_component": {"mpn": "rec-dedup-1uf"}, "qty": 40},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["component_created"] is False
    assert body["component"]["id"] == cid


def test_reception_stores_created_by_from_header():
    db = TestingSessionLocal()
    comp = _make_component(db, value="22R", mpn="REC-WS-22R")
    cid = comp.id
    db.close()
    res = client.post(
        "/api/marketplace/stock/receptions",
        json={"component_id": cid, "qty": 10},
        headers={"X-Workstation": "poste-atelier-1"},
    )
    assert res.status_code == 200
    db = TestingSessionLocal()
    movement = (
        db.query(StockMovement)
        .filter(
            StockMovement.component_id == cid,
            StockMovement.source_type == "reception_manuelle",
        )
        .one()
    )
    assert movement.created_by == "poste-atelier-1"
    db.close()


def test_movement_route_stores_created_by():
    db = TestingSessionLocal()
    comp = _make_component(db, value="330R", mpn="REC-WS-330R")
    cid = comp.id
    db.close()
    res = client.post(
        "/api/marketplace/stock/movements",
        json={"component_id": cid, "motif": "reception", "qty": 5},
        headers={"X-Workstation": "  poste-2  "},
    )
    assert res.status_code == 200
    db = TestingSessionLocal()
    movement = (
        db.query(StockMovement)
        .filter(
            StockMovement.component_id == cid,
            StockMovement.source_type == "reception_manuelle",
        )
        .one()
    )
    assert movement.created_by == "poste-2"  # header trimé
    db.close()


def test_reception_requires_exactly_one_target():
    res = client.post("/api/marketplace/stock/receptions", json={"qty": 5})
    assert res.status_code == 422
    db = TestingSessionLocal()
    comp = _make_component(db, value="X1", mpn="REC-BOTH-X1")
    cid = comp.id
    db.close()
    res = client.post(
        "/api/marketplace/stock/receptions",
        json={
            "component_id": cid,
            "new_component": {"mpn": "REC-BOTH-OTHER"},
            "qty": 5,
        },
    )
    assert res.status_code == 422


def test_reception_rejects_qty_zero():
    db = TestingSessionLocal()
    comp = _make_component(db, value="X2", mpn="REC-QTY0-X2")
    cid = comp.id
    db.close()
    res = client.post(
        "/api/marketplace/stock/receptions",
        json={"component_id": cid, "qty": 0},
    )
    assert res.status_code == 422
