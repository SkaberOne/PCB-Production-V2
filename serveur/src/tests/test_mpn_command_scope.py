"""Feature B — enrichissement MPN filtré par commande.

Couvre le câblage du paramètre ``command_id`` de GET /mpn-proposals et le helper
de résolution des composants d'une commande. Le chemin fonctionnel complet
(commande réelle avec BOM + composants) est validé sur staging.
"""

from src.tests.conftest import client, TestingSessionLocal

from src.models.bom import Component
from src.services.command_service import CommandService


def _make_component(reference, value="100nF", mpn=None):
    session = TestingSessionLocal()
    try:
        c = Component(reference=reference, value=value, mpn=mpn)
        session.add(c)
        session.commit()
        session.refresh(c)
        return c.id
    finally:
        session.close()


def test_ids_for_missing_command_is_empty():
    session = TestingSessionLocal()
    try:
        assert CommandService.component_library_ids_for_command(session, 999999) == []
    finally:
        session.close()


def test_mpn_proposals_missing_command_returns_empty_payload():
    # command_id inconnu -> pas d'erreur, payload vide bien formé.
    res = client.get("/api/marketplace/supplier-offers/mpn-proposals?command_id=999999")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["proposals"] == []
    assert body["counts"] == {"high": 0, "medium": 0, "manual": 0}


def test_mpn_proposals_without_command_still_lists_empty_mpn_components():
    # Rétro-compatibilité : sans command_id, comportement inchangé (toute la base).
    cid = _make_component("SCOPE-NOMPN", value="ZZValueUnique", mpn=None)
    res = client.get("/api/marketplace/supplier-offers/mpn-proposals")
    assert res.status_code == 200, res.text
    ids = {p["component_id"] for p in res.json()["proposals"]}
    assert cid in ids
