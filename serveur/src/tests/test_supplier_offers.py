"""Tests for SupplierOfferService (cache, refresh, sorting, MPN review) + routes."""

from tests.conftest import client, TestingSessionLocal

from src.models.bom import Component
from src.services.suppliers.base import OfferDTO
from src.services.supplier_offer_service import SupplierOfferService


class FakeConnector:
    name = "MOUSER"

    def __init__(self, offers):
        self._offers = offers

    @property
    def is_configured(self):
        return True

    def search_by_mpn(self, mpn):
        return self._offers

    def search_by_keyword(self, keyword):
        return self._offers


def _make_component(value="100nF", mpn="GRM188R71H104KA93D", reference="C0402_100NF"):
    session = TestingSessionLocal()
    try:
        component = Component(reference=reference, value=value, mpn=mpn)
        session.add(component)
        session.commit()
        session.refresh(component)
        return component.id
    finally:
        session.close()


def test_refresh_then_cache_roundtrip():
    component_id = _make_component()
    offers = [OfferDTO(supplier="MOUSER", supplier_part="81-X", mpn="GRM188R71H104KA93D",
                       manufacturer="Murata", unit_price=0.15, stock_qty=1000, currency="EUR",
                       price_breaks=[{"qty": 1, "price": 0.15}, {"qty": 100, "price": 0.08}])]
    session = TestingSessionLocal()
    try:
        result = SupplierOfferService.refresh_offers(
            session, [component_id], connectors=[FakeConnector(offers)]
        )
    finally:
        session.close()
    assert len(result[component_id]) == 1
    assert result[component_id][0]["unit_price"] == 0.15

    # Second call without connectors reads from cache.
    session = TestingSessionLocal()
    try:
        cached = SupplierOfferService.get_offers(session, [component_id])
    finally:
        session.close()
    assert cached[component_id][0]["supplier"] == "MOUSER"
    assert cached[component_id][0]["stale"] is False


def test_select_best_cheapest_prefers_in_stock_lowest_price():
    offers = [
        {"supplier": "MOUSER", "unit_price": 0.10, "stock_qty": 0, "price_breaks": [{"qty": 1, "price": 0.10}]},
        {"supplier": "DIGIKEY", "unit_price": 0.20, "stock_qty": 500, "price_breaks": [{"qty": 1, "price": 0.20}]},
        {"supplier": "FARNELL", "unit_price": 0.15, "stock_qty": 500, "price_breaks": [{"qty": 1, "price": 0.15}]},
    ]
    best = SupplierOfferService.select_best(offers, quantity=1, strategy="cheapest")
    assert best["supplier"] == "FARNELL"  # cheapest *in stock*


def test_select_best_priority_falls_back_when_unavailable():
    offers = [
        {"supplier": "MOUSER", "unit_price": 0.30, "stock_qty": 0, "price_breaks": [{"qty": 1, "price": 0.30}]},
        {"supplier": "DIGIKEY", "unit_price": 0.25, "stock_qty": 100, "price_breaks": [{"qty": 1, "price": 0.25}]},
    ]
    # Mouser prioritized but out of stock -> fall back to cheapest in stock.
    best = SupplierOfferService.select_best(offers, strategy="priority", priority_supplier="MOUSER")
    assert best["supplier"] == "DIGIKEY"


def test_mpn_proposal_and_apply_review_flow():
    component_id = _make_component(value="BAV199", mpn=None, reference="D_BAV199")
    offers = [OfferDTO(supplier="MOUSER", mpn="BAV199LT1G", manufacturer="onsemi", unit_price=0.05, stock_qty=10)]
    session = TestingSessionLocal()
    try:
        SupplierOfferService.refresh_offers(session, [component_id], connectors=[FakeConnector(offers)])
        proposals = SupplierOfferService.mpn_proposals(session, [component_id])
        assert len(proposals) == 1
        assert proposals[0]["proposed_mpn"] == "BAV199LT1G"
        assert proposals[0]["current_mpn"] in (None, "")

        applied = SupplierOfferService.apply_mpn(session, component_id, "BAV199LT1G")
        assert applied is True
        # Already set -> not overwritten.
        assert SupplierOfferService.apply_mpn(session, component_id, "OTHER") is False
    finally:
        session.close()


def test_supplier_offers_endpoints():
    component_id = _make_component(reference="C_endpoint")
    # Refresh with no configured connectors returns cache (empty) gracefully.
    resp = client.post("/api/marketplace/supplier-offers/refresh", json={"component_ids": [component_id]})
    assert resp.status_code == 200
    assert str(component_id) in {str(k) for k in resp.json()["offers"].keys()}

    resp = client.get(f"/api/marketplace/supplier-offers?component_ids={component_id}")
    assert resp.status_code == 200

    resp = client.get(f"/api/marketplace/supplier-offers/best?component_ids={component_id}&strategy=cheapest")
    assert resp.status_code == 200
