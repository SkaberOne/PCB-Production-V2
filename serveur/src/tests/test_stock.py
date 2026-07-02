"""Tests for the physical component stock (ADR 0010, Phase 1).

Covers: set-to declaration (idempotent, no double-count), correction, reception
reconcile-to-target + idempotence, reversible cancel, filtered-unique behaviour,
status computation, settings, get_or_create, and the reception hook resolution.
"""

import pytest
from sqlalchemy.exc import IntegrityError

from .conftest import client, TestingSessionLocal

from src.models.bom import Component
from src.models.stock import StockMovement, StockSens, StockMotif
from src.services.stock_service import StockService
import src.services.production_command_service as pcs


def _make_component(db, value="10K", mpn="RC0402-10K", footprint="R0402", ctype="RESISTOR"):
    comp = Component(
        reference=f"LIB-{value}-{footprint}",
        value=value,
        mpn=mpn,
        footprint_eagle=footprint,
        footprint_pnp=footprint,
        component_type=ctype,
    )
    db.add(comp)
    db.commit()
    db.refresh(comp)
    return comp


def _active_movements(db, component_id):
    return [
        m
        for m in db.query(StockMovement).filter(StockMovement.component_id == component_id).all()
        if not m.is_reversed
    ]


# --------------------------------------------------------------- declaration
def test_declaration_set_to_balance_and_breakdown():
    db = TestingSessionLocal()
    comp = _make_component(db)
    stock = StockService.post_declaration(db, comp.id, qty_reel=10, qty_bag=5, qty_tube=2)
    assert stock.qty_pieces == 17
    assert (stock.qty_reel, stock.qty_bag, stock.qty_tube) == (10, 5, 2)
    db.close()


def test_declaration_is_idempotent_on_resave():
    db = TestingSessionLocal()
    comp = _make_component(db)
    StockService.post_declaration(db, comp.id, qty_reel=10)
    StockService.post_declaration(db, comp.id, qty_reel=10)  # same total -> delta 0
    assert StockService.recompute_solde(db, comp.id) == 10
    # Only one actual movement was posted (second was a no-op).
    movements = db.query(StockMovement).filter(StockMovement.component_id == comp.id).count()
    assert movements == 1
    db.close()


def test_declaration_recount_down_posts_negative_delta():
    db = TestingSessionLocal()
    comp = _make_component(db)
    StockService.post_declaration(db, comp.id, qty_reel=15)
    StockService.post_declaration(db, comp.id, qty_reel=8)  # recount lower
    assert StockService.recompute_solde(db, comp.id) == 8
    outs = [m for m in _active_movements(db, comp.id) if m.sens == StockSens.OUT]
    assert any(m.qty == 7 for m in outs)
    db.close()


# ---------------------------------------------------------------- correction
def test_correction_sets_absolute_total():
    db = TestingSessionLocal()
    comp = _make_component(db)
    StockService.post_declaration(db, comp.id, qty_bag=5)
    StockService.post_correction(db, comp.id, new_total=20)
    assert StockService.recompute_solde(db, comp.id) == 20
    db.close()


# ----------------------------------------------------------------- reception
def test_reception_auto_in_and_idempotent():
    db = TestingSessionLocal()
    comp = _make_component(db)
    StockService.post_reception(db, receipt_id=1, component_id=comp.id, qty=100)
    assert StockService.recompute_solde(db, comp.id) == 100
    # Same receipt, same qty -> no new active movement.
    StockService.post_reception(db, receipt_id=1, component_id=comp.id, qty=100)
    assert len(_active_movements(db, comp.id)) == 1
    assert StockService.recompute_solde(db, comp.id) == 100
    db.close()


def test_reception_edit_reconciles_to_target():
    db = TestingSessionLocal()
    comp = _make_component(db)
    StockService.post_reception(db, receipt_id=1, component_id=comp.id, qty=100)
    StockService.post_reception(db, receipt_id=1, component_id=comp.id, qty=80)  # edited down
    assert StockService.recompute_solde(db, comp.id) == 80
    # Exactly one active movement for the receipt, plus reversal audit rows exist.
    active = _active_movements(db, comp.id)
    assert len(active) == 1 and active[0].qty == 80
    reversals = db.query(StockMovement).filter(
        StockMovement.component_id == comp.id, StockMovement.source_type == "reversal"
    ).count()
    assert reversals == 1
    db.close()


def test_reception_then_declaration_no_double_count():
    db = TestingSessionLocal()
    comp = _make_component(db)
    StockService.post_reception(db, receipt_id=1, component_id=comp.id, qty=100)
    # Physically recount 100 -> set-to delta 0, no double.
    StockService.post_declaration(db, comp.id, qty_reel=100)
    assert StockService.recompute_solde(db, comp.id) == 100
    db.close()


# ------------------------------------------------------------ reversible undo
def test_cancel_movement_is_reversible():
    db = TestingSessionLocal()
    comp = _make_component(db)
    StockService.post_correction(db, comp.id, new_total=30)
    movement = _active_movements(db, comp.id)[0]
    StockService.cancel_movement(db, movement.id)
    assert StockService.recompute_solde(db, comp.id) == 0
    db.refresh(movement)
    assert movement.is_reversed is True
    db.close()


# ------------------------------------------------------ filtered unique index
def test_filtered_unique_blocks_two_active_same_source():
    db = TestingSessionLocal()
    comp = _make_component(db)
    db.add(StockMovement(
        component_id=comp.id, sens=StockSens.IN, qty=5, motif=StockMotif.reception,
        source_type="reception", source_id="99", is_reversed=False,
    ))
    db.commit()
    db.add(StockMovement(
        component_id=comp.id, sens=StockSens.IN, qty=7, motif=StockMotif.reception,
        source_type="reception", source_id="99", is_reversed=False,
    ))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()
    db.close()


# ------------------------------------------------------------------- status
def test_status_ok_bas_manque():
    db = TestingSessionLocal()
    comp = _make_component(db)
    StockService.set_component_params(db, comp.id, safety_stock=10)
    StockService.post_declaration(db, comp.id, qty_reel=5)  # 5 <= 10 -> bas
    line = next(r for r in StockService.list_stock(db) if r["component_id"] == comp.id)
    assert line["status"] == "bas"
    StockService.post_correction(db, comp.id, new_total=50)  # > 10 -> ok
    line = next(r for r in StockService.list_stock(db) if r["component_id"] == comp.id)
    assert line["status"] == "ok"
    StockService.post_correction(db, comp.id, new_total=-3)  # negative -> manque
    line = next(r for r in StockService.list_stock(db) if r["component_id"] == comp.id)
    assert line["status"] == "manque"
    db.close()


# ------------------------------------------------------------------ settings
def test_global_loss_settings_roundtrip():
    resp = client.get("/api/marketplace/stock/settings")
    assert resp.status_code == 200
    assert resp.json()["global_loss_pct"] == 0.0
    resp = client.put("/api/marketplace/stock/settings", json={"global_loss_pct": 3.5})
    assert resp.status_code == 200
    assert resp.json()["global_loss_pct"] == 3.5


def test_component_loss_override_and_effective():
    db = TestingSessionLocal()
    comp = _make_component(db)
    db.close()
    StockService_db = TestingSessionLocal()
    StockService.set_global_loss_pct(StockService_db, 2.0)
    StockService.set_component_params(StockService_db, comp.id, loss_pct=5.0)
    line = next(r for r in StockService.list_stock(StockService_db) if r["component_id"] == comp.id)
    assert line["effective_loss_pct"] == 5.0
    # Clear override -> falls back to global.
    StockService.set_component_params(StockService_db, comp.id, loss_pct=None)
    line = next(r for r in StockService.list_stock(StockService_db) if r["component_id"] == comp.id)
    assert line["effective_loss_pct"] == 2.0
    StockService_db.close()


# ------------------------------------------------------------ get_or_create
def test_get_or_create_component_is_stable():
    db = TestingSessionLocal()
    c1 = StockService.get_or_create_component(db, value="1uF", mpn=None, footprint_eagle="C0402")
    c2 = StockService.get_or_create_component(db, value="1uF", mpn=None, footprint_eagle="C0402")
    assert c1.id == c2.id
    db.close()


# --------------------------------------------------- reception hook resolution
def test_sync_stock_reception_matched(monkeypatch):
    db = TestingSessionLocal()
    comp = _make_component(db)
    monkeypatch.setattr(
        pcs.CommandService,
        "get_command_summary",
        staticmethod(lambda **kw: {"aggregated_components": [
            {"key": "K1", "component_library_id": comp.id, "value": "10K",
             "component_mpn": None, "footprint": "R0402", "component_type": "RESISTOR"},
        ]}),
    )

    class _Receipt:
        id = 501
        line_key = "K1"
        qty_received = 42

    pcs.ProductionCommandService._sync_stock_reception(db, command_id=1, receipt=_Receipt())
    assert StockService.recompute_solde(db, comp.id) == 42
    db.close()


def test_sync_stock_reception_unmatched_creates_component(monkeypatch):
    db = TestingSessionLocal()
    monkeypatch.setattr(
        pcs.CommandService,
        "get_command_summary",
        staticmethod(lambda **kw: {"aggregated_components": [
            {"key": "K2", "component_library_id": None, "value": "22R",
             "component_mpn": "MPN-22R", "footprint": "R0603", "component_type": "RESISTOR"},
        ]}),
    )

    class _Receipt:
        id = 777
        line_key = "K2"
        qty_received = 10

    before = db.query(Component).count()
    pcs.ProductionCommandService._sync_stock_reception(db, command_id=1, receipt=_Receipt())
    assert db.query(Component).count() == before + 1
    created = db.query(Component).filter(Component.mpn == "MPN-22R").first()
    assert created is not None
    assert StockService.recompute_solde(db, created.id) == 10
    db.close()
