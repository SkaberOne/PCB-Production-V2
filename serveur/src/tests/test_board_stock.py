"""Tests : stock de cartes finies + commandes client/machine (ADR 0017)."""

from .conftest import TestingSessionLocal

from src.models.bom import BomReference
from src.models.costing import ProductionCosting
from src.services.board_stock_service import BoardStockService, ClientOrderService


def _ref(db, name):
    r = BomReference(reference=name)
    db.add(r)
    db.flush()
    return r


def test_list_board_stock_defaults_and_effective_price():
    db = TestingSessionLocal()
    ref = _ref(db, "CARTE-A")
    # Prix de référence Costing
    db.add(ProductionCosting(bom_reference_id=ref.id, quantity=10, unit_cost_ht=12.5, is_reference=True))
    db.commit()

    rows = BoardStockService.list_board_stock(db)
    line = next(r for r in rows if r["bom_reference_id"] == ref.id)
    assert line["qty_in_stock"] == 0
    assert line["reference_unit_cost_ht"] == 12.5
    assert line["unit_price_effective"] == 12.5  # pas d'override
    assert line["below_min"] is False

    # Override + stock + min
    BoardStockService.upsert(db, ref.id, qty_in_stock=3, min_stock=5, unit_price_override=20.0)
    rows = BoardStockService.list_board_stock(db)
    line = next(r for r in rows if r["bom_reference_id"] == ref.id)
    assert line["qty_in_stock"] == 3
    assert line["unit_price_effective"] == 20.0
    assert line["stock_value"] == 60.0  # 20 × 3
    assert line["below_min"] is True     # 3 < 5
    db.close()


def test_clear_price_override_falls_back_to_costing():
    db = TestingSessionLocal()
    ref = _ref(db, "CARTE-B")
    db.add(ProductionCosting(bom_reference_id=ref.id, quantity=1, unit_cost_ht=8.0, is_reference=True))
    db.commit()
    BoardStockService.upsert(db, ref.id, unit_price_override=99.0)
    BoardStockService.upsert(db, ref.id, clear_price_override=True)
    line = next(r for r in BoardStockService.list_board_stock(db) if r["bom_reference_id"] == ref.id)
    assert line["unit_price_override"] is None
    assert line["unit_price_effective"] == 8.0
    db.close()


def test_order_create_prepare_decrements_stock_and_status():
    db = TestingSessionLocal()
    ref = _ref(db, "CARTE-C")
    db.commit()
    BoardStockService.upsert(db, ref.id, qty_in_stock=10)

    order = ClientOrderService.create_order(
        db, order_type="CLIENT", recipient="ACME",
        lines=[{"bom_reference_id": ref.id, "quantity": 4}],
    )
    assert order["reference"].startswith("CMD-")
    assert order["status"] == "OPEN"
    line_id = order["lines"][0]["id"]

    # Prépare 4 -> boîte pleine, statut READY, stock 10 -> 6
    updated = ClientOrderService.prepare(db, order["id"], line_id, 4)
    assert updated["status"] == "READY"
    assert updated["fully_prepared"] is True
    stock = next(r for r in BoardStockService.list_board_stock(db) if r["bom_reference_id"] == ref.id)
    assert stock["qty_in_stock"] == 6

    # Retrait (qty négatif) -> rend au stock, repasse OPEN
    updated = ClientOrderService.prepare(db, order["id"], line_id, -1)
    assert updated["status"] == "OPEN"
    stock = next(r for r in BoardStockService.list_board_stock(db) if r["bom_reference_id"] == ref.id)
    assert stock["qty_in_stock"] == 7
    db.close()


def test_prepare_caps_at_requested_quantity():
    db = TestingSessionLocal()
    ref = _ref(db, "CARTE-D")
    db.commit()
    BoardStockService.upsert(db, ref.id, qty_in_stock=100)
    order = ClientOrderService.create_order(db, lines=[{"bom_reference_id": ref.id, "quantity": 3}])
    line_id = order["lines"][0]["id"]
    updated = ClientOrderService.prepare(db, order["id"], line_id, 10)  # borné à 3
    assert updated["lines"][0]["quantity_prepared"] == 3
    stock = next(r for r in BoardStockService.list_board_stock(db) if r["bom_reference_id"] == ref.id)
    assert stock["qty_in_stock"] == 97  # 100 − 3
    db.close()


def test_cards_to_produce_shortage():
    db = TestingSessionLocal()
    ref = _ref(db, "CARTE-E")
    db.commit()
    BoardStockService.upsert(db, ref.id, qty_in_stock=2)
    ClientOrderService.create_order(db, lines=[{"bom_reference_id": ref.id, "quantity": 5}])

    todo = BoardStockService.cards_to_produce(db)
    line = next(r for r in todo if r["bom_reference_id"] == ref.id)
    assert line["demand_remaining"] == 5
    assert line["in_stock"] == 2
    assert line["to_produce"] == 3  # 5 − 2
    db.close()


def test_set_lines_preserves_prepared():
    db = TestingSessionLocal()
    ref = _ref(db, "CARTE-F")
    db.commit()
    BoardStockService.upsert(db, ref.id, qty_in_stock=10)
    order = ClientOrderService.create_order(db, lines=[{"bom_reference_id": ref.id, "quantity": 4}])
    line_id = order["lines"][0]["id"]
    ClientOrderService.prepare(db, order["id"], line_id, 2)
    # Modifie la quantité à 6 : la préparation (2) est conservée.
    updated = ClientOrderService.set_lines(db, order["id"], [{"bom_reference_id": ref.id, "quantity": 6}])
    assert updated["lines"][0]["quantity"] == 6
    assert updated["lines"][0]["quantity_prepared"] == 2
    db.close()
