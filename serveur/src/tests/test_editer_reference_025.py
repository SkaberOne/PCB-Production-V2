"""Tests prompt 025 — éditer la référence d'une carte (unicité + snapshots + liens).

- renommer vers une référence libre → OK, `rename_reference_tree(old, new)` appelé ;
- renommer vers une référence déjà prise → CardReferenceConflict (409 via l'API) ;
- référence vide → ValueError ; name/part_number préservés si non fournis ;
- liens BoardStock (par id) intacts après renommage.
"""
import pytest

from .conftest import TestingSessionLocal, client
from src.models.bom import BomReference
from src.models.board_stock import BoardStock
from src.services import card_catalog_service
from src.services.card_catalog_service import CardCatalogService, CardReferenceConflict


def _ref(db, reference, **kw):
    r = BomReference(reference=reference, **kw)
    db.add(r)
    db.flush()
    return r


def test_rename_reference_ok_and_snapshots_moved(monkeypatch):
    calls = []
    monkeypatch.setattr(
        card_catalog_service.bom_file_service,
        "rename_reference_tree",
        lambda old, new: calls.append((old, new)),
    )
    db = TestingSessionLocal()
    a = _ref(db, "KT240576", name="OTR", part_number="KT111")
    db.commit()
    card = CardCatalogService.update_card(db, a.id, reference="KT240576B")
    assert card["reference"] == "KT240576B"
    # name / part_number préservés (non fournis)
    assert card["name"] == "OTR"
    assert card["part_number"] == "KT111"
    # snapshots déplacés old -> new
    assert calls == [("KT240576", "KT240576B")]
    db.close()


def test_rename_reference_conflict_raises(monkeypatch):
    monkeypatch.setattr(card_catalog_service.bom_file_service, "rename_reference_tree", lambda old, new: None)
    db = TestingSessionLocal()
    a = _ref(db, "CARD-A")
    b = _ref(db, "CARD-B")
    db.commit()
    with pytest.raises(CardReferenceConflict):
        CardCatalogService.update_card(db, b.id, reference="CARD-A")
    # b inchangée
    db.refresh(b)
    assert b.reference == "CARD-B"
    db.close()


def test_rename_reference_empty_rejected(monkeypatch):
    monkeypatch.setattr(card_catalog_service.bom_file_service, "rename_reference_tree", lambda old, new: None)
    db = TestingSessionLocal()
    a = _ref(db, "CARD-EMPTY")
    db.commit()
    with pytest.raises(ValueError):
        CardCatalogService.update_card(db, a.id, reference="   ")
    db.close()


def test_rename_same_reference_no_snapshot_move(monkeypatch):
    calls = []
    monkeypatch.setattr(card_catalog_service.bom_file_service, "rename_reference_tree", lambda old, new: calls.append((old, new)))
    db = TestingSessionLocal()
    a = _ref(db, "CARD-SAME")
    db.commit()
    CardCatalogService.update_card(db, a.id, reference="CARD-SAME")
    assert calls == []  # pas de déplacement si identique
    db.close()


def test_boardstock_link_intact_after_rename(monkeypatch):
    monkeypatch.setattr(card_catalog_service.bom_file_service, "rename_reference_tree", lambda old, new: None)
    db = TestingSessionLocal()
    a = _ref(db, "CARD-LINK")
    db.flush()
    db.add(BoardStock(bom_reference_id=a.id, revision="REV_A", qty_in_stock=5))
    db.commit()
    ref_id = a.id
    CardCatalogService.update_card(db, ref_id, reference="CARD-LINK-2")
    # le lien stock (par id) pointe toujours sur la même carte, désormais renommée
    stock = db.query(BoardStock).filter(BoardStock.bom_reference_id == ref_id).first()
    assert stock is not None
    assert db.query(BomReference).filter(BomReference.id == ref_id).first().reference == "CARD-LINK-2"
    db.close()


# ── API ──────────────────────────────────────────────────────────────────────

def test_api_put_reference_ok(monkeypatch):
    monkeypatch.setattr(card_catalog_service.bom_file_service, "rename_reference_tree", lambda old, new: None)
    db = TestingSessionLocal()
    a = _ref(db, "API-CARD")
    db.commit()
    rid = a.id
    db.close()
    resp = client.put(f"/api/marketplace/cards/{rid}", json={"reference": "API-CARD-NEW"})
    assert resp.status_code == 200
    assert resp.json()["reference"] == "API-CARD-NEW"


def test_api_put_reference_conflict_409(monkeypatch):
    monkeypatch.setattr(card_catalog_service.bom_file_service, "rename_reference_tree", lambda old, new: None)
    db = TestingSessionLocal()
    a = _ref(db, "API-A")
    b = _ref(db, "API-B")
    db.commit()
    bid = b.id
    db.close()
    resp = client.put(f"/api/marketplace/cards/{bid}", json={"reference": "API-A"})
    assert resp.status_code == 409
    assert "déjà utilisée" in resp.json()["detail"]
