"""Tests prompt 023 — refus de suppression détaillé + liens orphelins non bloquants.

- le refus 409 **nomme** chaque bloqueur (nature + identifiant + statut) ;
- distinction **commande interne** (COMMANDS) vs **commande client** (CLIENT_ORDERS) ;
- un lien **orphelin** (commande parente supprimée) ne bloque plus la suppression ;
- non-régression : carte réellement liée refusée, carte non liée supprimée.
"""
import pytest
from sqlalchemy import text

from src.tests.conftest import TestingSessionLocal, client
from src.models.bom import BomItem, BomReference, BomRevision
from src.models.board_stock import ClientOrder, ClientOrderLine
from src.models.commands import Command, CommandItem
from src.services.bom_reference_service import (
    ReferenceLinkedError,
    delete_reference,
)


@pytest.fixture
def db():
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def db_fk():
    session = TestingSessionLocal()
    session.execute(text("PRAGMA foreign_keys = ON"))
    try:
        yield session
    finally:
        # StaticPool partage la connexion : remettre OFF pour ne pas fuiter aux tests suivants.
        session.execute(text("PRAGMA foreign_keys = OFF"))
        session.close()


def make_card(db, reference="REF-A", items=1):
    ref = BomReference(reference=reference, card_type="SIMPLE")
    db.add(ref)
    db.flush()
    rev = BomRevision(bom_ref_id=ref.id, revision="REV_A", type=BomRevision.TypeEnum.TOP)
    db.add(rev)
    db.flush()
    for i in range(items):
        db.add(BomItem(bom_revision_id=rev.id, reference_item=f"R{i}", placement_side="TOP"))
    db.commit()
    return ref, rev


# ── Nommage des bloqueurs ────────────────────────────────────────────────────

def test_refus_nomme_commande_interne(db):
    ref, rev = make_card(db, "REF-INT")
    cmd = Command(name="Commande REF-INT REV_A")  # statut défaut DRAFT
    db.add(cmd)
    db.flush()
    db.add(CommandItem(command_id=cmd.id, bom_revision_id=rev.id))
    db.commit()

    with pytest.raises(ReferenceLinkedError) as exc:
        delete_reference(db, ref.id)
    link = next(l for l in exc.value.links if l["nature"] == "commande interne")
    assert link["id"] == cmd.id
    assert "DRAFT" in link["label"] and str(cmd.id) in link["label"]
    assert any("commande interne" in r for r in exc.value.reasons)


def test_refus_nomme_commande_client(db):
    ref, rev = make_card(db, "REF-CLI")
    order = ClientOrder(reference="CMD-0003", status="DELIVERED")
    db.add(order)
    db.flush()
    db.add(ClientOrderLine(order_id=order.id, bom_reference_id=ref.id, quantity=1))
    db.commit()

    with pytest.raises(ReferenceLinkedError) as exc:
        delete_reference(db, ref.id)
    link = next(l for l in exc.value.links if l["nature"] == "commande client")
    assert link["reference"] == "CMD-0003"
    assert "CMD-0003" in link["label"] and "DELIVERED" in link["label"]


def test_refus_liste_interne_et_client(db):
    ref, rev = make_card(db, "REF-BOTH")
    cmd = Command(name="Interne BOTH")
    db.add(cmd)
    db.flush()
    db.add(CommandItem(command_id=cmd.id, bom_revision_id=rev.id))
    order = ClientOrder(reference="CMD-0009", status="OPEN")
    db.add(order)
    db.flush()
    db.add(ClientOrderLine(order_id=order.id, bom_reference_id=ref.id, quantity=2))
    db.commit()

    with pytest.raises(ReferenceLinkedError) as exc:
        delete_reference(db, ref.id)
    natures = {l["nature"] for l in exc.value.links}
    assert "commande interne" in natures
    assert "commande client" in natures


# ── Liens orphelins non bloquants ────────────────────────────────────────────

def test_command_item_orphelin_ne_bloque_pas(db):
    """CommandItem dont la COMMANDS parente a été supprimée → non bloquant."""
    db.execute(text("PRAGMA foreign_keys = OFF"))
    ref, rev = make_card(db, "REF-ORPH-INT")
    cmd = Command(name="A supprimer")
    db.add(cmd)
    db.flush()
    db.add(CommandItem(command_id=cmd.id, bom_revision_id=rev.id))
    db.commit()
    # Supprime la commande parente → l'item devient orphelin (FK off en test simple).
    db.query(Command).filter(Command.id == cmd.id).delete(synchronize_session=False)
    db.commit()

    # Aucun bloqueur → suppression réussit.
    ref_id = ref.id
    assert _link_count(db, ref) == 0
    res = delete_reference(db, ref_id)
    assert res["deleted"] is True
    assert db.query(BomReference).filter(BomReference.id == ref_id).first() is None


def test_client_order_line_orphelin_ne_bloque_pas(db):
    db.execute(text("PRAGMA foreign_keys = OFF"))
    ref, rev = make_card(db, "REF-ORPH-CLI")
    order = ClientOrder(reference="CMD-ORPH", status="OPEN")
    db.add(order)
    db.flush()
    db.add(ClientOrderLine(order_id=order.id, bom_reference_id=ref.id, quantity=1))
    db.commit()
    db.query(ClientOrder).filter(ClientOrder.id == order.id).delete(synchronize_session=False)
    db.commit()

    res = delete_reference(db, ref.id)
    assert res["deleted"] is True


def _link_count(db, ref):
    from src.services.bom_reference_service import _link_details
    revs = list(ref.revisions or [])
    return len(_link_details(db, ref, [r.id for r in revs]))


# ── Non-régression ───────────────────────────────────────────────────────────

def test_carte_non_liee_supprimee(db_fk):
    ref, rev = make_card(db_fk, "REF-FREE", items=2)
    res = delete_reference(db_fk, ref.id)
    assert res["deleted"] is True
    assert db_fk.query(BomReference).count() == 0


# ── API : 409 détaillé (detail string + links structurés) ────────────────────

def test_api_409_detail_et_links(db):
    ref, rev = make_card(db, "REF-API-023")
    cmd = Command(name="Interne API")
    db.add(cmd)
    db.flush()
    db.add(CommandItem(command_id=cmd.id, bom_revision_id=rev.id))
    order = ClientOrder(reference="CMD-API", status="READY")
    db.add(order)
    db.flush()
    db.add(ClientOrderLine(order_id=order.id, bom_reference_id=ref.id, quantity=1))
    db.commit()

    resp = client.delete(f"/api/bom/references/{ref.id}")
    assert resp.status_code == 409
    body = resp.json()
    assert "non supprimable" in body["detail"]
    natures = {l["nature"] for l in body["links"]}
    assert {"commande interne", "commande client"} <= natures
