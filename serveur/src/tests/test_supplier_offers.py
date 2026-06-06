"""Tests for SupplierOfferService (cache, refresh, sorting, MPN review) + routes."""

from src.tests.conftest import client, TestingSessionLocal

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


# --------------------------------------------------------- tiered MPN proposals


class TieredFakeConnector:
    """Fake connector that returns different results for MPN vs keyword search."""

    name = "MOUSER"

    def __init__(self, mpn_offers=None, keyword_offers=None):
        self._mpn_offers = mpn_offers or []
        self._keyword_offers = keyword_offers or []

    @property
    def is_configured(self):
        return True

    def search_by_mpn(self, mpn):
        return self._mpn_offers

    def search_by_keyword(self, keyword):
        return self._keyword_offers


def _set_package(component_id, package):
    session = TestingSessionLocal()
    try:
        component = session.query(Component).filter(Component.id == component_id).first()
        component.package = package
        session.commit()
    finally:
        session.close()


def test_build_proposals_high_exact_match():
    cid = _make_component(value="RSX101M-30", mpn=None, reference="D_RSX101")
    offers = [OfferDTO(supplier="MOUSER", mpn="RSX101M-30", manufacturer="Rohm",
                       unit_price=0.20, stock_qty=500)]
    session = TestingSessionLocal()
    try:
        props = SupplierOfferService.build_mpn_proposals(
            session, component_ids=[cid], live=True,
            connectors=[TieredFakeConnector(mpn_offers=offers)],
        )
    finally:
        session.close()
    assert len(props) == 1
    proposal = props[0]
    assert proposal["confidence"] == "high"
    assert proposal["source"] == "exact_mpn"
    assert proposal["proposed_mpn"] == "RSX101M-30"


def test_build_proposals_medium_keyword_package_ranks_in_stock_first():
    cid = _make_component(value="10K", mpn=None, reference="R_10K_0603")
    _set_package(cid, "0603")
    keyword_offers = [
        OfferDTO(supplier="MOUSER", mpn="RC0603FR-0710KL", manufacturer="Yageo",
                 unit_price=0.01, stock_qty=0),
        OfferDTO(supplier="MOUSER", mpn="CRCW060310K0FKEA", manufacturer="Vishay",
                 unit_price=0.01, stock_qty=1000),
    ]
    session = TestingSessionLocal()
    try:
        props = SupplierOfferService.build_mpn_proposals(
            session, component_ids=[cid], live=True,
            connectors=[TieredFakeConnector(keyword_offers=keyword_offers)],
        )
    finally:
        session.close()
    proposal = props[0]
    assert proposal["confidence"] == "medium"
    assert proposal["source"] == "keyword_package"
    assert len(proposal["candidates"]) == 2
    assert proposal["proposed_mpn"] == "CRCW060310K0FKEA"  # in-stock ranked first


def test_build_proposals_manual_when_no_offer():
    cid = _make_component(value="hthr", mpn=None, reference="X_NOOFFER")
    session = TestingSessionLocal()
    try:
        props = SupplierOfferService.build_mpn_proposals(
            session, component_ids=[cid], live=True, connectors=[TieredFakeConnector()],
        )
    finally:
        session.close()
    assert props[0]["confidence"] == "manual"


def test_build_proposals_skips_nc_dnp_placeholders():
    cid_nc = _make_component(value="NC", mpn=None, reference="PH_NC")
    cid_dnp = _make_component(value="dnp", mpn=None, reference="PH_DNP")  # casse ignorée
    # Connecteur qui RENVERRAIT un match — il ne doit pas être consulté pour un placeholder.
    offers = [OfferDTO(supplier="MOUSER", mpn="SOME-PART-123", manufacturer="X",
                       unit_price=0.1, stock_qty=99)]
    session = TestingSessionLocal()
    try:
        props = SupplierOfferService.build_mpn_proposals(
            session, component_ids=[cid_nc, cid_dnp], live=True,
            connectors=[TieredFakeConnector(mpn_offers=offers, keyword_offers=offers)],
        )
    finally:
        session.close()
    by_id = {p["component_id"]: p for p in props}
    assert by_id[cid_nc]["confidence"] == "manual"
    assert by_id[cid_nc]["proposed_mpn"] is None
    assert by_id[cid_nc]["candidates"] == []
    assert by_id[cid_dnp]["confidence"] == "manual"
    assert by_id[cid_dnp]["proposed_mpn"] is None


def test_build_proposals_skips_filled_mpn():
    cid = _make_component(value="BAV199", mpn="BAV199LT1G", reference="D_FILLED")
    session = TestingSessionLocal()
    try:
        props = SupplierOfferService.build_mpn_proposals(session, component_ids=[cid], live=False)
    finally:
        session.close()
    assert props == []


def test_build_proposals_limit_caps_components():
    ids = [_make_component(value="NC", mpn=None, reference=f"L_{i}") for i in range(3)]
    session = TestingSessionLocal()
    try:
        props = SupplierOfferService.build_mpn_proposals(
            session, component_ids=ids, live=False, limit=1
        )
    finally:
        session.close()
    assert len(props) == 1


def test_apply_mpn_batch_applies_and_skips():
    c1 = _make_component(value="RSX101M-30", mpn=None, reference="B_apply")
    c2 = _make_component(value="DMG3406L-7", mpn="DMG3406L-7", reference="B_filled")
    session = TestingSessionLocal()
    try:
        result = SupplierOfferService.apply_mpn_batch(session, [
            {"component_id": c1, "mpn": "RSX101M-30"},
            {"component_id": c2, "mpn": "OTHER"},
            {"component_id": 999999, "mpn": "ZZZ"},
        ])
    finally:
        session.close()
    assert {a["component_id"] for a in result["applied"]} == {c1}
    reasons = {s["component_id"]: s["reason"] for s in result["skipped"]}
    assert reasons[c2] == "already_set"
    assert reasons[999999] == "not_found"


def test_mpn_proposals_endpoint_returns_counts():
    cid = _make_component(value="someval123X", mpn=None, reference="EP_counts")
    resp = client.get(
        f"/api/marketplace/supplier-offers/mpn-proposals?component_ids={cid}&live=false"
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "proposals" in body and "counts" in body
    assert body["live"] is False


def test_mpn_apply_batch_endpoint():
    cid = _make_component(value="RSX999A-30", mpn=None, reference="EP_batch")
    resp = client.post(
        "/api/marketplace/supplier-offers/mpn-apply-batch",
        json={"items": [{"component_id": cid, "mpn": "RSX999A-30"}]},
    )
    assert resp.status_code == 200
    assert resp.json()["applied"][0]["component_id"] == cid


def test_supplier_credentials_roundtrip(tmp_path, monkeypatch):
    from src.services import supplier_credentials

    monkeypatch.setattr(supplier_credentials, "_STORE_PATH", tmp_path / "creds.json")

    # Defaults when nothing stored yet.
    resp = client.get("/api/marketplace/supplier-offers/credentials")
    assert resp.status_code == 200
    providers = resp.json()["providers"]
    assert providers["mouser"]["api_key_set"] is False
    assert providers["mouser"]["auth_type"] == "api_key"
    assert providers["digikey"]["auth_type"] == "client_credentials"

    # Save credentials.
    resp = client.put(
        "/api/marketplace/supplier-offers/credentials",
        json={
            "mouser": {"auth_type": "api_key", "api_key": "SECRET-MOUSER-1234"},
            "digikey": {"auth_type": "client_credentials", "client_id": "CID-9", "client_secret": "DKSECRET-5678"},
        },
    )
    assert resp.status_code == 200
    out = resp.json()["providers"]
    assert out["mouser"]["api_key_set"] is True
    assert out["mouser"]["api_key_hint"].endswith("1234")
    assert out["digikey"]["client_id"] == "CID-9"
    # Secrets are never echoed back in clear text.
    assert "SECRET-MOUSER-1234" not in str(out)
    assert "DKSECRET-5678" not in str(out)

    # A blank secret keeps the previously stored value.
    resp = client.put(
        "/api/marketplace/supplier-offers/credentials",
        json={"mouser": {"auth_type": "api_key", "api_key": ""}},
    )
    assert resp.json()["providers"]["mouser"]["api_key_set"] is True
    assert supplier_credentials.load_credentials()["mouser"]["api_key"] == "SECRET-MOUSER-1234"
