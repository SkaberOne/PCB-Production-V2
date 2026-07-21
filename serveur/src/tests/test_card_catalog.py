"""Tests : catalogue de cartes unifié + assemblages (ADR 0018)."""

import pytest

from .conftest import TestingSessionLocal

from src.models.bom import BomReference
from src.models.costing import ProductionCosting
from src.services.card_catalog_service import CardCatalogService


def _ref(db, name, **kw):
    r = BomReference(reference=name, **kw)
    db.add(r)
    db.flush()
    return r


def test_update_card_fields_and_part_number_unique():
    db = TestingSessionLocal()
    a = _ref(db, "CARTE-A")
    b = _ref(db, "CARTE-B")
    db.commit()
    card = CardCatalogService.update_card(db, a.id, name="Ampli", part_number="KT111111", card_type="SIMPLE")
    assert card["name"] == "Ampli"
    assert card["part_number"] == "KT111111"
    assert card["card_type"] == "SIMPLE"
    # Code déjà attribué -> refus
    with pytest.raises(ValueError):
        CardCatalogService.update_card(db, b.id, part_number="KT111111")
    db.close()


def test_find_by_part_number():
    db = TestingSessionLocal()
    a = _ref(db, "OTR board Bicolor")
    db.commit()
    CardCatalogService.update_card(db, a.id, part_number="KT240576")
    found = CardCatalogService.find_by_part_number(db, "KT240576")
    assert found is not None and found.id == a.id
    assert CardCatalogService.find_by_part_number(db, "INCONNU") is None
    db.close()


def test_assembly_price_is_sum_of_children():
    db = TestingSessionLocal()
    parent = _ref(db, "ASSEMBLAGE")
    c1 = _ref(db, "SOUS-CARTE-1")
    c2 = _ref(db, "SOUS-CARTE-2")
    db.commit()
    db.add(ProductionCosting(bom_reference_id=c1.id, quantity=1, unit_cost_ht=10.0, is_reference=True))
    db.add(ProductionCosting(bom_reference_id=c2.id, quantity=1, unit_cost_ht=4.5, is_reference=True))
    db.commit()
    CardCatalogService.set_assembly(db, parent.id, [
        {"child_reference_id": c1.id, "quantity": 2},
        {"child_reference_id": c2.id, "quantity": 1},
    ])
    card = CardCatalogService.get_card(db, parent.id)
    assert card["card_type"] == "ASSEMBLY"
    assert card["unit_price"] == 24.5  # 10×2 + 4.5×1
    assert card["price_complete"] is True
    db.close()


def test_assembly_price_incomplete_when_child_has_no_costing():
    db = TestingSessionLocal()
    parent = _ref(db, "ASM")
    c1 = _ref(db, "AVEC-PRIX")
    c2 = _ref(db, "SANS-PRIX")
    db.commit()
    db.add(ProductionCosting(bom_reference_id=c1.id, quantity=1, unit_cost_ht=7.0, is_reference=True))
    db.commit()
    CardCatalogService.set_assembly(db, parent.id, [
        {"child_reference_id": c1.id, "quantity": 1},
        {"child_reference_id": c2.id, "quantity": 3},
    ])
    card = CardCatalogService.get_card(db, parent.id)
    assert card["unit_price"] == 7.0
    assert card["price_complete"] is False
    db.close()


def test_assembly_rejects_cycle():
    db = TestingSessionLocal()
    a = _ref(db, "A")
    b = _ref(db, "B")
    db.commit()
    # A contient B
    CardCatalogService.set_assembly(db, a.id, [{"child_reference_id": b.id, "quantity": 1}])
    # B contient A -> cycle -> refus
    with pytest.raises(ValueError):
        CardCatalogService.set_assembly(db, b.id, [{"child_reference_id": a.id, "quantity": 1}])
    # A dans A -> refus direct
    with pytest.raises(ValueError):
        CardCatalogService.set_assembly(db, a.id, [{"child_reference_id": a.id, "quantity": 1}])
    db.close()


def test_list_cards_includes_revisions_and_defaults():
    db = TestingSessionLocal()
    a = _ref(db, "CARTE-REV")
    db.commit()
    cards = {c["bom_reference_id"]: c for c in CardCatalogService.list_cards(db)}
    assert a.id in cards
    assert cards[a.id]["card_type"] == "SIMPLE"
    assert cards[a.id]["assembly_items"] == []
    db.close()
