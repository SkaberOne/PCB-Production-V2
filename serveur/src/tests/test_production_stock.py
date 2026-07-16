"""Tests for Phase 2 stock: production close (OUT), runs, reservation, can-produce.

See docs/adr/0011-cloture-production-reservation-stock.md.
"""

from .conftest import TestingSessionLocal

from src.models.bom import BomItem, BomReference, BomRevision, Component
from src.models.production import Production, ProductionBomRevision, ProductionRun
from src.services.stock_service import StockService
from src.services.production_stock_service import ProductionStockService


def _component(db, value, fp):
    c = Component(
        reference=f"LIB-{value}-{fp}", value=value, mpn=None,
        footprint_pnp=fp, footprint_eagle=fp, component_type="X",
    )
    db.add(c)
    db.flush()
    return c


def _production(db, name, faces, qty=10, status=Production.StatusEnum.ACTIVE):
    """faces = [(side, [(value, footprint, qty, dnp), ...]), ...]"""
    prod = Production(name=name, status=status)
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
        db.add(ProductionBomRevision(
            production_id=prod.id, bom_revision_id=rev.id, quantity_to_produce=qty,
        ))
    db.commit()
    return prod


def test_produce_posts_out_and_decrements():
    db = TestingSessionLocal()
    r = _component(db, "10k", "R0402")
    db.commit()
    prod = _production(db, "P1", [("TOP", [("10k", "R0402", 1, False)])])
    ProductionStockService.produce(db, prod.id, machine_id=None, boards_produced=5)
    assert StockService.recompute_solde(db, r.id) == -5
    db.close()


def test_top_bot_shared_quantity_not_doubled():
    db = TestingSessionLocal()
    r = _component(db, "10k", "R0402")
    c = _component(db, "100n", "C0402")
    db.commit()
    prod = _production(db, "P2", [
        ("TOP", [("10k", "R0402", 1, False)]),
        ("BOT", [("100n", "C0402", 1, False)]),
    ])
    ProductionStockService.produce(db, prod.id, machine_id=None, boards_produced=5)
    # 5 boards → each face's component consumed 5 (NOT 10).
    assert StockService.recompute_solde(db, r.id) == -5
    assert StockService.recompute_solde(db, c.id) == -5
    db.close()


def test_multiple_runs_add_up():
    db = TestingSessionLocal()
    r = _component(db, "10k", "R0402")
    db.commit()
    prod = _production(db, "P3", [("TOP", [("10k", "R0402", 1, False)])])
    ProductionStockService.produce(db, prod.id, None, 5)
    ProductionStockService.produce(db, prod.id, None, 3)
    assert StockService.recompute_solde(db, r.id) == -8
    assert len(ProductionStockService.list_runs(db, prod.id)) == 2
    db.close()


def test_edit_run_reconciles():
    db = TestingSessionLocal()
    r = _component(db, "10k", "R0402")
    db.commit()
    prod = _production(db, "P4", [("TOP", [("10k", "R0402", 1, False)])])
    run = ProductionStockService.produce(db, prod.id, None, 5)
    assert StockService.recompute_solde(db, r.id) == -5
    ProductionStockService.update_run(db, run.id, 2)  # re-edit down
    assert StockService.recompute_solde(db, r.id) == -2
    db.close()


def test_cancel_run_is_reversible():
    db = TestingSessionLocal()
    r = _component(db, "10k", "R0402")
    db.commit()
    prod = _production(db, "P5", [("TOP", [("10k", "R0402", 1, False)])])
    run = ProductionStockService.produce(db, prod.id, None, 5)
    ProductionStockService.cancel_run(db, run.id)
    assert StockService.recompute_solde(db, r.id) == 0
    db.refresh(run)
    assert run.is_cancelled is True
    db.close()


def test_loss_coefficient_applied():
    db = TestingSessionLocal()
    r = _component(db, "10k", "R0402")
    db.commit()
    StockService.set_global_loss_pct(db, 10.0)
    prod = _production(db, "P6", [("TOP", [("10k", "R0402", 1, False)])])
    ProductionStockService.produce(db, prod.id, None, 10)  # ceil(1*10*1.1)=11
    assert StockService.recompute_solde(db, r.id) == -11
    db.close()


def test_dnp_excluded_from_consumption():
    db = TestingSessionLocal()
    r = _component(db, "10k", "R0402")
    db.commit()
    prod = _production(db, "P7", [("TOP", [
        ("10k", "R0402", 1, False),
        ("1k", "R0603", 1, True),  # DNP → excluded
    ])])
    needs, _ = ProductionStockService.aggregate_needs_per_board(db, prod.id)
    assert needs == {r.id: 1}
    db.close()


def test_can_i_produce_reservation_and_shortage():
    db = TestingSessionLocal()
    r = _component(db, "10k", "R0402")
    db.commit()
    # stock 30
    StockService.post_declaration(db, r.id, qty_reel=30)
    # target needs 2/board × 10 boards = 20
    target = _production(db, "TARGET", [("TOP", [("10k", "R0402", 2, False)])], qty=10)
    # other production reserves 10/board? here 1 × 10 = 10
    _production(db, "OTHER", [("TOP", [("10k", "R0402", 1, False)])], qty=10)

    res = ProductionStockService.can_i_produce(db, target.id)
    line = next(l for l in res["lines"] if l["component_id"] == r.id)
    assert line["besoin"] == 20
    assert line["solde"] == 30
    assert line["reserve"] == 10
    assert line["disponible"] == 20
    assert line["manque"] == 0
    assert res["can_produce"] is True

    # Increase the other production's need → shortage on target
    other = db.query(Production).filter(Production.name == "OTHER").first()
    link = db.query(ProductionBomRevision).filter_by(production_id=other.id).first()
    link.quantity_to_produce = 25
    db.commit()
    res2 = ProductionStockService.can_i_produce(db, target.id)
    line2 = next(l for l in res2["lines"] if l["component_id"] == r.id)
    assert line2["reserve"] == 25
    assert line2["disponible"] == 5
    assert line2["manque"] == 15
    assert line2["a_commander"] == 15
    assert res2["can_produce"] is False
    db.close()


def test_draft_does_not_reserve_against_active():
    """Priorité : un brouillon ne bloque pas une production active."""
    db = TestingSessionLocal()
    r = _component(db, "10k", "R0402")
    db.commit()
    StockService.post_declaration(db, r.id, qty_reel=30)
    target = _production(
        db, "ACTIVE_TARGET", [("TOP", [("10k", "R0402", 2, False)])],
        qty=10, status=Production.StatusEnum.ACTIVE,
    )
    # Gros brouillon qui, sans priorité, réserverait tout (5 × 10 = 50).
    _production(
        db, "BIG_DRAFT", [("TOP", [("10k", "R0402", 5, False)])],
        qty=10, status=Production.StatusEnum.DRAFT,
    )
    res = ProductionStockService.can_i_produce(db, target.id)
    line = next(l for l in res["lines"] if l["component_id"] == r.id)
    assert line["besoin"] == 20
    assert line["reserve"] == 0            # le brouillon est ignoré
    assert line["disponible"] == 30
    assert line["manque"] == 0
    assert res["can_produce"] is True
    db.close()


def test_active_reserves_against_draft():
    """Une production active prime : elle réserve contre un brouillon."""
    db = TestingSessionLocal()
    r = _component(db, "10k", "R0402")
    db.commit()
    StockService.post_declaration(db, r.id, qty_reel=30)
    target = _production(
        db, "DRAFT_TARGET", [("TOP", [("10k", "R0402", 1, False)])],
        qty=10, status=Production.StatusEnum.DRAFT,
    )
    _production(
        db, "ACTIVE_OTHER", [("TOP", [("10k", "R0402", 2, False)])],
        qty=10, status=Production.StatusEnum.ACTIVE,
    )
    res = ProductionStockService.can_i_produce(db, target.id)
    line = next(l for l in res["lines"] if l["component_id"] == r.id)
    assert line["besoin"] == 10
    assert line["reserve"] == 20           # l'active réserve contre le brouillon
    assert line["disponible"] == 10
    db.close()


def test_draft_reserves_against_draft():
    """Deux brouillons se partagent le stock (priorité égale)."""
    db = TestingSessionLocal()
    r = _component(db, "10k", "R0402")
    db.commit()
    StockService.post_declaration(db, r.id, qty_reel=30)
    target = _production(
        db, "DRAFT_A", [("TOP", [("10k", "R0402", 1, False)])],
        qty=10, status=Production.StatusEnum.DRAFT,
    )
    _production(
        db, "DRAFT_B", [("TOP", [("10k", "R0402", 2, False)])],
        qty=10, status=Production.StatusEnum.DRAFT,
    )
    res = ProductionStockService.can_i_produce(db, target.id)
    line = next(l for l in res["lines"] if l["component_id"] == r.id)
    assert line["reserve"] == 20           # l'autre brouillon réserve
    assert line["disponible"] == 10
    db.close()


def test_produce_endpoint_http():
    from .conftest import client
    db = TestingSessionLocal()
    _component(db, "10k", "R0402")
    db.commit()
    prod = _production(db, "P_HTTP", [("TOP", [("10k", "R0402", 1, False)])])
    pid = prod.id
    db.close()
    resp = client.post(f"/api/marketplace/machines/1/productions/{pid}/produce",
                       json={"boards_produced": 4})
    assert resp.status_code == 200, resp.text
    assert resp.json()["boards_produced"] == 4
    runs = client.get(f"/api/marketplace/machines/1/productions/{pid}/runs")
    assert runs.status_code == 200
    assert len(runs.json()) == 1
