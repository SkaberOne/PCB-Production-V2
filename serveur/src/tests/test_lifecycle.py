"""Tests du statut de cycle de vie des composants (ADR 0014, phase A1).

Couvre la normalisation des libellés fournisseurs, l'agrégation pire-cas, et
l'écriture du statut sur Component lors d'un refresh d'offres.
"""

from src.tests.conftest import client, TestingSessionLocal

from src.models.bom import Component
from src.services import lifecycle
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


def _make_component(reference, value="10K", mpn="RC0402FR-0710KL"):
    session = TestingSessionLocal()
    try:
        c = Component(reference=reference, value=value, mpn=mpn)
        session.add(c)
        session.commit()
        session.refresh(c)
        return c.id
    finally:
        session.close()


def test_normalize_lifecycle_mapping():
    assert lifecycle.normalize_lifecycle("Active") == lifecycle.ACTIVE
    assert lifecycle.normalize_lifecycle("In Production") == lifecycle.ACTIVE
    assert lifecycle.normalize_lifecycle("Not Recommended for New Designs") == lifecycle.NRND
    assert lifecycle.normalize_lifecycle("Last Time Buy") == lifecycle.NRND
    assert lifecycle.normalize_lifecycle("Obsolete") == lifecycle.EOL
    assert lifecycle.normalize_lifecycle("End of Life") == lifecycle.EOL
    assert lifecycle.normalize_lifecycle("") == lifecycle.UNKNOWN
    assert lifecycle.normalize_lifecycle(None) == lifecycle.UNKNOWN
    assert lifecycle.normalize_lifecycle("bidule inconnu") == lifecycle.UNKNOWN


def test_worst_case_keeps_most_severe():
    assert lifecycle.worst_case([lifecycle.ACTIVE, lifecycle.EOL, lifecycle.NRND]) == lifecycle.EOL
    assert lifecycle.worst_case([lifecycle.ACTIVE, lifecycle.NRND]) == lifecycle.NRND
    assert lifecycle.worst_case([lifecycle.ACTIVE, lifecycle.ACTIVE]) == lifecycle.ACTIVE
    assert lifecycle.worst_case([lifecycle.UNKNOWN, lifecycle.UNKNOWN]) == lifecycle.UNKNOWN
    assert lifecycle.worst_case([]) == lifecycle.UNKNOWN


def test_component_defaults_unknown():
    cid = _make_component("LIB-LC-DEF")
    session = TestingSessionLocal()
    try:
        c = session.get(Component, cid)
        assert c.lifecycle_status == "UNKNOWN"
        assert c.lifecycle_checked_at is None
    finally:
        session.close()


def test_refresh_aggregates_lifecycle_worst_case():
    cid = _make_component("LIB-LC-EOL")
    # Deux offres : une Active, une Obsolete -> pire-cas EOL.
    offers = [
        OfferDTO(supplier="MOUSER", mpn="RC0402FR-0710KL", unit_price=0.01, lifecycle_status="Active"),
        OfferDTO(supplier="MOUSER", mpn="RC0402FR-0710KL", unit_price=0.02, lifecycle_status="Obsolete"),
    ]
    session = TestingSessionLocal()
    try:
        SupplierOfferService.refresh_offers(session, [cid], connectors=[FakeConnector(offers)])
    finally:
        session.close()

    session = TestingSessionLocal()
    try:
        c = session.get(Component, cid)
        assert c.lifecycle_status == "EOL"
        assert c.lifecycle_checked_at is not None
    finally:
        session.close()


def test_refresh_does_not_clobber_when_no_lifecycle():
    cid = _make_component("LIB-LC-KEEP")
    # 1er refresh : EOL
    session = TestingSessionLocal()
    try:
        SupplierOfferService.refresh_offers(
            session, [cid],
            connectors=[FakeConnector([OfferDTO(supplier="MOUSER", mpn="X", unit_price=1, lifecycle_status="Obsolete")])],
        )
    finally:
        session.close()
    # 2e refresh : offres sans info cycle de vie -> ne doit PAS repasser à UNKNOWN
    session = TestingSessionLocal()
    try:
        SupplierOfferService.refresh_offers(
            session, [cid],
            connectors=[FakeConnector([OfferDTO(supplier="MOUSER", mpn="X", unit_price=1)])],
        )
    finally:
        session.close()
    session = TestingSessionLocal()
    try:
        assert session.get(Component, cid).lifecycle_status == "EOL"
    finally:
        session.close()
