"""Tests prompt 020 — suppression d'une carte (unitaire + bulk) + garde-fous liens.

Couvre :
  - suppression d'une carte NON liée : BomReference + BomRevision + BomItem
    supprimés, aucun orphelin (session avec ``PRAGMA foreign_keys=ON`` pour
    reproduire l'enforcement FK prod SQL Server) ;
  - refus (ReferenceLinkedError / HTTP 409) si la carte est liée : stock cartes
    (qty>0), sous-carte d'assemblage ;
  - stock cartes qty=0 ne bloque PAS ;
  - bulk : mix supprimables / refusées → rapport {deleted, skipped} ;
  - idempotence : ValueError / HTTP 404 si la carte n'existe pas.
"""
import pytest
from sqlalchemy import text

from src.tests.conftest import TestingSessionLocal, engine, client
from src.database import Base
from src.models.bom import AssemblyItem, BomItem, BomReference, BomRevision
from src.models.board_stock import BoardStock
from src.services.bom_reference_service import (
    ReferenceLinkedError,
    delete_reference,
    delete_references_bulk,
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
    """Session avec PRAGMA foreign_keys=ON (enforcement FK comme en prod)."""
    session = TestingSessionLocal()
    session.execute(text("PRAGMA foreign_keys = ON"))
    try:
        yield session
    finally:
        session.close()


# ── Helpers ────────────────────────────────────────────────────────────────

def make_card(db, reference="REF-A", card_type="SIMPLE", items=2):
    ref = BomReference(reference=reference, card_type=card_type)
    db.add(ref)
    db.flush()
    rev = BomRevision(bom_ref_id=ref.id, revision="REV_A", type=BomRevision.TypeEnum.TOP)
    db.add(rev)
    db.flush()
    for i in range(items):
        db.add(BomItem(
            bom_revision_id=rev.id,
            reference_item=f"R{i}",
            placement_side="TOP",
        ))
    db.commit()
    return ref.id


def counts(db):
    return (
        db.query(BomReference).count(),
        db.query(BomRevision).count(),
        db.query(BomItem).count(),
    )


# ── Suppression unitaire (cascade / no-orphan) ───────────────────────────────

def test_delete_reference_removes_all_children_no_orphan(db_fk):
    ref_id = make_card(db_fk, "REF-DEL", items=3)
    assert counts(db_fk) == (1, 1, 3)

    result = delete_reference(db_fk, ref_id)

    assert result["deleted"] is True
    assert result["reference"] == "REF-DEL"
    # aucun orphelin : révisions + items partis avec la carte
    assert counts(db_fk) == (0, 0, 0)


def test_delete_nonexistent_raises_value_error(db):
    with pytest.raises(ValueError):
        delete_reference(db, 999999)


# ── Garde-fous : refus si liée ───────────────────────────────────────────────

def test_delete_refused_when_board_stock_positive(db):
    ref_id = make_card(db, "REF-STOCK")
    db.add(BoardStock(bom_reference_id=ref_id, revision="REV_A", qty_in_stock=5))
    db.commit()

    with pytest.raises(ReferenceLinkedError) as exc:
        delete_reference(db, ref_id)
    assert any("stock" in r for r in exc.value.reasons)
    # la carte n'a PAS été supprimée
    assert db.query(BomReference).filter(BomReference.id == ref_id).first() is not None


def test_delete_allowed_when_board_stock_zero(db_fk):
    ref_id = make_card(db_fk, "REF-STOCK0")
    db_fk.add(BoardStock(bom_reference_id=ref_id, revision="REV_A", qty_in_stock=0))
    db_fk.commit()

    result = delete_reference(db_fk, ref_id)
    assert result["deleted"] is True
    assert db_fk.query(BoardStock).count() == 0


def test_delete_refused_when_subcard_of_assembly(db):
    child_id = make_card(db, "REF-CHILD")
    parent_id = make_card(db, "REF-PARENT", card_type="ASSEMBLY")
    db.add(AssemblyItem(parent_reference_id=parent_id, child_reference_id=child_id, quantity=2))
    db.commit()

    with pytest.raises(ReferenceLinkedError) as exc:
        delete_reference(db, child_id)
    assert any("assemblage" in r for r in exc.value.reasons)


# ── Bulk ─────────────────────────────────────────────────────────────────────

def test_bulk_mixed_report(db):
    ok1 = make_card(db, "REF-OK1")
    ok2 = make_card(db, "REF-OK2")
    linked = make_card(db, "REF-LINKED")
    db.add(BoardStock(bom_reference_id=linked, revision="REV_A", qty_in_stock=3))
    db.commit()

    report = delete_references_bulk(db, [ok1, ok2, linked, 424242])

    deleted_ids = {d["id"] for d in report["deleted"]}
    skipped_ids = {s["id"] for s in report["skipped"]}
    assert deleted_ids == {ok1, ok2}
    assert linked in skipped_ids
    assert 424242 in skipped_ids
    linked_entry = next(s for s in report["skipped"] if s["id"] == linked)
    assert any("stock" in r for r in linked_entry["reasons"])
    missing_entry = next(s for s in report["skipped"] if s["id"] == 424242)
    assert missing_entry["reasons"] == ["introuvable"]


# ── API (HTTP status codes) ──────────────────────────────────────────────────

def test_api_delete_reference_200(db):
    ref_id = make_card(db, "REF-API-OK")
    resp = client.delete(f"/api/bom/references/{ref_id}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["deleted"] is True
    assert body["reference"] == "REF-API-OK"


def test_api_delete_reference_409_when_linked(db):
    ref_id = make_card(db, "REF-API-LINK")
    db.add(BoardStock(bom_reference_id=ref_id, revision="REV_A", qty_in_stock=7))
    db.commit()
    resp = client.delete(f"/api/bom/references/{ref_id}")
    assert resp.status_code == 409
    assert "non supprimable" in resp.json()["detail"]


def test_api_delete_reference_404_when_absent(db):
    resp = client.delete("/api/bom/references/987654")
    assert resp.status_code == 404


def test_api_bulk_delete_report(db):
    ok = make_card(db, "REF-API-BULK-OK")
    linked = make_card(db, "REF-API-BULK-LINK")
    db.add(BoardStock(bom_reference_id=linked, revision="REV_A", qty_in_stock=2))
    db.commit()
    resp = client.request("DELETE", "/api/bom/references", json={"ids": [ok, linked]})
    assert resp.status_code == 200
    body = resp.json()
    assert [d["id"] for d in body["deleted"]] == [ok]
    assert [s["id"] for s in body["skipped"]] == [linked]
