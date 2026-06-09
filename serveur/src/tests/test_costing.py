"""Tests for the costing service and /api/costing endpoints (ADR 0005)."""

import json

import pytest

from src.tests.conftest import TestingSessionLocal, client
from src.models.bom import BomItem, BomReference, BomRevision, Component
from src.models.commands import SupplierOffer
from src.models.machines import PnpMachine
from src.models.production import Production, ProductionBomRevision
from src.services.costing_service import CostingService


@pytest.fixture
def db():
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


def _build_production(db, *, priced=True, qty_per_board=2, comp_value="10K", footprint="R0805"):
    """Create a minimal production with one TOP card and one priced BOM line."""
    machine = PnpMachine(name="MACHINE-01", num_positions=40)
    db.add(machine)
    db.flush()

    production = Production(name="PROD-COST", machine_id=machine.id)
    db.add(production)
    db.flush()

    ref = BomReference(reference="KT-TEST", category="Carrier")
    db.add(ref)
    db.flush()

    rev = BomRevision(
        bom_ref_id=ref.id,
        revision="A",
        type=BomRevision.TypeEnum.TOP,
        status=BomRevision.StatusEnum.ACTIVE,
    )
    db.add(rev)
    db.flush()

    component = Component(
        reference="R0805-10K", value=comp_value, package="0805", footprint_pnp=footprint
    )
    db.add(component)
    db.flush()

    db.add(
        BomItem(
            bom_revision_id=rev.id,
            reference_item="R1",
            value_harmonized=comp_value,
            footprint_pnp=footprint,
            quantity=qty_per_board,
            dnp=False,
        )
    )
    if priced:
        db.add(
            SupplierOffer(
                component_id=component.id,
                supplier="MOUSER",
                unit_price=0.10,
                currency="EUR",
                stock_qty=10000,
                price_breaks=json.dumps([{"qty": 1, "price": 0.10}]),
            )
        )
    db.add(
        ProductionBomRevision(
            production_id=production.id,
            bom_revision_id=rev.id,
            sequence_order=1,
            quantity_to_produce=10,
        )
    )
    db.commit()
    return production, ref


class TestComputeCard:
    def test_unit_cost_matches_expected_breakdown(self, db):
        production, ref = _build_production(db)
        CostingService.update_input(
            db,
            production.id,
            {
                "quantity_produced": 10,
                "pcb_total_price": 100.0,
                "stencil_cost": 50.0,
                "amortize_stencil": True,
                "assembly_time_top_h": 3.0,
                "assembly_time_bot_h": 0.0,
                "tht_time_h": 0.0,
            },
        )

        result = CostingService.compute_production(db, production.id)
        assert len(result["cards"]) == 1
        card = result["cards"][0]

        # material: 2*0.10 + 2 paste + 100/10 pcb + 50/10 stencil = 17.20
        assert card["material"]["subtotal"] == pytest.approx(17.20)
        # labor: (0.02 prep + 3 top + 1 test + 0.30 rework) * 40 = 172.80
        assert card["labor"]["subtotal"] == pytest.approx(172.80)
        assert card["unit_cost_ht"] == pytest.approx(190.00)
        assert card["unit_cost_ttc"] == pytest.approx(228.00)
        assert card["total_ht"] == pytest.approx(1900.00)
        assert card["quantity"] == 10
        assert card["material"]["complete"] is True

    def test_stencil_not_amortized_when_flag_off(self, db):
        production, ref = _build_production(db)
        CostingService.update_input(
            db, production.id, {"quantity_produced": 10, "stencil_cost": 50.0, "amortize_stencil": False}
        )
        card = CostingService.compute_production(db, production.id)["cards"][0]
        # stencil full per board = 50 (vs 5 when amortized)
        assert card["material"]["stencil_per_board"] == pytest.approx(50.0)

    def test_unpriced_component_reported_not_zeroed(self, db):
        production, ref = _build_production(db, priced=False)
        card = CostingService.compute_production(db, production.id)["cards"][0]
        assert card["material"]["complete"] is False
        assert card["material"]["missing"]  # non-empty


class TestSnapshotAndHistory:
    def test_snapshot_creates_reference_then_history_grows(self, db):
        production, ref = _build_production(db)
        CostingService.update_input(db, production.id, {"quantity_produced": 10})

        CostingService.snapshot_production(db, production.id)
        hist1 = CostingService.card_history(db, ref.id)
        assert hist1["reference_price"] is not None
        assert hist1["reference_price"]["is_reference"] is True
        assert len(hist1["history"]) == 1

        CostingService.snapshot_production(db, production.id)
        hist2 = CostingService.card_history(db, ref.id)
        assert len(hist2["history"]) == 2
        # exactly one reference at a time
        assert sum(1 for h in hist2["history"] if h["is_reference"]) == 1


class TestEndpoints:
    def test_parameters_get_and_update(self):
        r = client.get("/api/costing/parameters")
        assert r.status_code == 200
        assert r.json()["labor_rate"] == 40.0

        r = client.put("/api/costing/parameters", json={"labor_rate": 45.0})
        assert r.status_code == 200
        assert r.json()["labor_rate"] == 45.0

    def test_production_endpoint_and_inputs(self, db):
        production, ref = _build_production(db)
        r = client.put(
            f"/api/costing/productions/{production.id}/inputs",
            json={"quantity_produced": 10, "pcb_total_price": 100.0},
        )
        assert r.status_code == 200
        assert r.json()["quantity_produced"] == 10

        r = client.get(f"/api/costing/productions/{production.id}")
        assert r.status_code == 200
        body = r.json()
        assert body["production_id"] == production.id
        assert len(body["cards"]) == 1

    def test_missing_production_returns_404(self):
        r = client.get("/api/costing/productions/999999")
        assert r.status_code == 404

    def test_cards_listing(self, db):
        _build_production(db)
        r = client.get("/api/costing/cards")
        assert r.status_code == 200
        assert any(c["reference"] == "KT-TEST" for c in r.json())
