"""Tests Phase 3 — stock engagé sur feeders (ADR 0012)."""

from .conftest import TestingSessionLocal, client

from src.models.bom import BomItem, BomReference, BomRevision, Component
from src.models.machines import PnpMachine
from src.models.production import Production, ProductionBomRevision
from src.services.stock_service import StockService
from src.services.production_stock_service import ProductionStockService


def _component(db, value="10k", fp="R0402"):
    c = Component(
        reference=f"LIB-{value}-{fp}", value=value, mpn=None,
        footprint_pnp=fp, footprint_eagle=fp, component_type="X",
    )
    db.add(c)
    db.flush()
    return c


def _machine(db, name="PNP-T"):
    m = PnpMachine(name=name, num_positions=60)
    db.add(m)
    db.flush()
    return m


def _production(db, name, faces, qty=10):
    prod = Production(name=name, status=Production.StatusEnum.ACTIVE)
    db.add(prod)
    db.flush()
    ref = BomReference(reference=f"{name}_REF")
    db.add(ref)
    db.flush()
    for side, items in faces:
        rev = BomRevision(bom_ref_id=ref.id, revision="REV_A", type=side)
        db.add(rev)
        db.flush()
        for i, (val, fp, q, dnp) in enumerate(items):
            db.add(BomItem(
                bom_revision_id=rev.id, reference_item=f"{side}{i}",
                value_raw=val, value_harmonized=val, footprint_eagle=fp,
                footprint_pnp=fp, component_type="X", quantity=q, dnp=dnp,
            ))
        db.add(ProductionBomRevision(production_id=prod.id, bom_revision_id=rev.id, quantity_to_produce=qty))
    db.commit()
    return prod


def test_set_and_engaged():
    db = TestingSessionLocal()
    c = _component(db)
    m = _machine(db)
    db.commit()
    StockService.set_machine_load(db, m.id, c.id, 30)
    assert StockService.engaged_by_component(db) == {c.id: 30}
    db.close()


def test_unload_removes_row():
    db = TestingSessionLocal()
    c = _component(db)
    m = _machine(db)
    db.commit()
    StockService.set_machine_load(db, m.id, c.id, 30)
    StockService.set_machine_load(db, m.id, c.id, 0)  # décharge
    assert StockService.engaged_by_component(db) == {}
    assert StockService.list_machine_loads(db, m.id) == []
    db.close()


def test_engaged_sums_across_machines():
    db = TestingSessionLocal()
    c = _component(db)
    m1 = _machine(db, "PNP-1")
    m2 = _machine(db, "PNP-2")
    db.commit()
    StockService.set_machine_load(db, m1.id, c.id, 30)
    StockService.set_machine_load(db, m2.id, c.id, 20)
    assert StockService.engaged_by_component(db)[c.id] == 50
    db.close()


def test_list_stock_engaged_and_libre():
    db = TestingSessionLocal()
    c = _component(db)
    m = _machine(db)
    db.commit()
    StockService.post_declaration(db, c.id, qty_reel=100)  # solde 100
    StockService.set_machine_load(db, m.id, c.id, 30)
    line = next(r for r in StockService.list_stock(db) if r["component_id"] == c.id)
    assert line["qty_pieces"] == 100
    assert line["engaged"] == 30
    assert line["libre"] == 70
    db.close()


def test_can_produce_engaged_reduces_dispo():
    db = TestingSessionLocal()
    r = _component(db)
    m = _machine(db)
    db.commit()
    StockService.post_declaration(db, r.id, qty_reel=50)
    prod = _production(db, "P", [("TOP", [("10k", "R0402", 1, False)])])  # besoin 10
    StockService.set_machine_load(db, m.id, r.id, 45)  # dispo = 50 - 0 - 45 = 5
    res = ProductionStockService.can_i_produce(db, prod.id)
    line = next(l for l in res["lines"] if l["component_id"] == r.id)
    assert line["solde"] == 50
    assert line["engage"] == 45
    assert line["disponible"] == 5
    assert line["manque"] == 5
    db.close()


def test_http_load_unload():
    db = TestingSessionLocal()
    c = _component(db)
    m = _machine(db)
    db.commit()
    mid, cid = m.id, c.id
    db.close()
    resp = client.put(f"/api/marketplace/machines/{mid}/loads/{cid}", json={"qty_loaded": 25})
    assert resp.status_code == 200, resp.text
    assert any(x["component_id"] == cid and x["qty_loaded"] == 25 for x in resp.json())
    g = client.get(f"/api/marketplace/machines/{mid}/loads")
    assert g.status_code == 200 and len(g.json()) == 1
    unloaded = client.put(f"/api/marketplace/machines/{mid}/loads/{cid}", json={"qty_loaded": 0})
    assert unloaded.status_code == 200 and unloaded.json() == []


def test_http_load_unknown_machine():
    resp = client.put("/api/marketplace/machines/9999/loads/9999", json={"qty_loaded": 5})
    assert resp.status_code == 404
