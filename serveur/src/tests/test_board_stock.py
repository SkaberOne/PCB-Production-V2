"""Tests : stock de cartes finies + commandes client/machine (ADR 0017)."""

from .conftest import TestingSessionLocal

from src.models.bom import BomReference
from src.models.costing import ProductionCosting
from src.services.board_stock_service import (
    BoardStockService,
    ClientOrderService,
    ClientService,
    MachineModelService,
)


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


def test_machine_order_expands_cards_from_model():
    db = TestingSessionLocal()
    ca = _ref(db, "MC-A")
    cb = _ref(db, "MC-B")
    db.commit()
    model = MachineModelService.create_model(
        db, name="Machine X",
        cards=[{"bom_reference_id": ca.id, "quantity": 2}, {"bom_reference_id": cb.id, "quantity": 1}],
    )
    assert model["total_cards"] == 3
    client = ClientService.create_client(db, name="ACME")
    # Commande MACHINE : 3 machines -> cartes ×3 (A=6, B=3)
    order = ClientOrderService.create_order(
        db, order_type="MACHINE", client_id=client["id"],
        machine_model_id=model["id"], machine_count=3,
    )
    assert order["order_type"] == "MACHINE"
    assert order["machine_count"] == 3
    by_ref = {l["bom_reference_id"]: l["quantity"] for l in order["lines"]}
    assert by_ref[ca.id] == 6
    assert by_ref[cb.id] == 3
    db.close()


def test_client_detail_aggregates_cards_to_prepare():
    db = TestingSessionLocal()
    ref = _ref(db, "CD-A")
    db.commit()
    client = ClientService.create_client(db, name="Client Détail")
    ClientOrderService.create_order(db, client_id=client["id"], lines=[{"bom_reference_id": ref.id, "quantity": 4}])
    ClientOrderService.create_order(db, client_id=client["id"], lines=[{"bom_reference_id": ref.id, "quantity": 3}])
    detail = ClientService.client_detail(db, client["id"])
    assert len(detail["orders"]) == 2
    ctp = next(c for c in detail["cards_to_prepare"] if c["bom_reference_id"] == ref.id)
    assert ctp["to_prepare"] == 7  # 4 + 3
    db.close()


def test_delivered_at_set_on_delivery():
    db = TestingSessionLocal()
    ref = _ref(db, "DL-A")
    db.commit()
    order = ClientOrderService.create_order(db, lines=[{"bom_reference_id": ref.id, "quantity": 2}])
    assert order["delivered_at"] is None
    delivered = ClientOrderService.update_order(db, order["id"], status="DELIVERED")
    assert delivered["status"] == "DELIVERED"
    assert delivered["delivered_at"] is not None
    # Repasser en OPEN efface la date de livraison.
    reopened = ClientOrderService.update_order(db, order["id"], status="OPEN")
    assert reopened["delivered_at"] is None
    db.close()


def test_duplicate_client_rejected():
    db = TestingSessionLocal()
    ClientService.create_client(db, name="Doublon")
    import pytest
    with pytest.raises(ValueError):
        ClientService.create_client(db, name="Doublon")
    db.close()


def test_board_stock_revisions_are_independent():
    """Deux révisions d'une même carte = deux lignes de stock distinctes."""
    db = TestingSessionLocal()
    ref = _ref(db, "REV-CARTE")
    db.commit()
    BoardStockService.upsert(db, ref.id, revision="REV_A", qty_in_stock=5)
    BoardStockService.upsert(db, ref.id, revision="REV_B", qty_in_stock=8)
    rows = [r for r in BoardStockService.list_board_stock(db) if r["bom_reference_id"] == ref.id]
    by_rev = {r["revision"]: r["qty_in_stock"] for r in rows}
    assert by_rev.get("REV_A") == 5
    assert by_rev.get("REV_B") == 8
    db.close()


def test_order_revision_decrements_correct_stock():
    """Préparer une ligne REV_B ne touche que le stock REV_B."""
    db = TestingSessionLocal()
    ref = _ref(db, "REV-CMD")
    db.commit()
    BoardStockService.upsert(db, ref.id, revision="REV_A", qty_in_stock=10)
    BoardStockService.upsert(db, ref.id, revision="REV_B", qty_in_stock=10)
    order = ClientOrderService.create_order(
        db, lines=[{"bom_reference_id": ref.id, "revision": "REV_B", "quantity": 4}],
    )
    assert order["lines"][0]["revision"] == "REV_B"
    line_id = order["lines"][0]["id"]
    ClientOrderService.prepare(db, order["id"], line_id, 4)
    rows = {r["revision"]: r["qty_in_stock"]
            for r in BoardStockService.list_board_stock(db) if r["bom_reference_id"] == ref.id}
    assert rows["REV_A"] == 10  # intact
    assert rows["REV_B"] == 6   # 10 − 4
    db.close()


def test_cards_to_produce_per_revision():
    db = TestingSessionLocal()
    ref = _ref(db, "REV-TODO")
    db.commit()
    BoardStockService.upsert(db, ref.id, revision="REV_A", qty_in_stock=1)
    ClientOrderService.create_order(db, lines=[{"bom_reference_id": ref.id, "revision": "REV_A", "quantity": 5}])
    ClientOrderService.create_order(db, lines=[{"bom_reference_id": ref.id, "revision": "REV_B", "quantity": 2}])
    todo = {r["revision"]: r for r in BoardStockService.cards_to_produce(db) if r["bom_reference_id"] == ref.id}
    assert todo["REV_A"]["to_produce"] == 4  # 5 − 1
    assert todo["REV_B"]["to_produce"] == 2  # 2 − 0
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
