"""Complétion manuelle des lignes de commande (COMMAND_LINE_DETAILS).

Couvre ProductionCommandService.set_line_detail :
  - override quantité à commander + note persistés par ligne
  - offre fournisseur manuelle exposée via _detail_to_offer
  - MPN écrit sur le composant biblio quand component_library_id est fourni
  - MPN de repli (manual_mpn) quand la ligne n'a pas de composant biblio
  - effacement de l'override quand quantity_to_order = None
"""

from .conftest import TestingSessionLocal

from src.models.bom import Component
from src.models.commands import Command
from src.services.production_command_service import ProductionCommandService as PCS


def _make_command(db):
    command = Command(name="Commande test", status=Command.StatusEnum.DRAFT)
    db.add(command)
    db.commit()
    db.refresh(command)
    return command


def test_set_line_detail_persists_and_updates_library_mpn():
    db = TestingSessionLocal()
    try:
        command = _make_command(db)
        component = Component(reference="R-TEST-1", value="10k", mpn=None)
        db.add(component)
        db.commit()
        db.refresh(component)

        summary = PCS.set_line_detail(
            db,
            command.id,
            "10k__0603__RES",
            mpn="RC0603FR-0710KL",
            quantity_to_order=42,
            note="équivalent accepté",
            supplier="LCSC",
            supplier_part="C25804",
            unit_price=0.012,
            currency="EUR",
            product_url="https://lcsc.com/x",
            component_library_id=component.id,
        )

        assert summary["command_id"] == command.id

        # MPN écrit sur la bibliothèque (toutes BOM).
        db.refresh(component)
        assert component.mpn == "RC0603FR-0710KL"

        details = PCS.get_line_details(db, command.id)
        row = details["10k__0603__RES"]
        assert row.quantity_to_order == 42
        assert row.note == "équivalent accepté"
        assert row.manual_mpn is None  # écrit en biblio, pas de repli

        offer = PCS._detail_to_offer(row)
        assert offer["supplier"] == "LCSC"
        assert offer["unit_price"] == 0.012
        assert offer["product_url"] == "https://lcsc.com/x"
        assert offer["manual"] is True
    finally:
        db.close()


def test_set_line_detail_mpn_fallback_without_library_component():
    db = TestingSessionLocal()
    try:
        command = _make_command(db)
        PCS.set_line_detail(
            db,
            command.id,
            "custom__SOT23__IC",
            mpn="ATTINY85",
            component_library_id=None,
        )
        row = PCS.get_line_details(db, command.id)["custom__SOT23__IC"]
        assert row.manual_mpn == "ATTINY85"
        assert row.quantity_to_order is None
        assert PCS._detail_to_offer(row) is None  # aucune offre saisie
    finally:
        db.close()


def test_set_line_detail_clear_quantity_override():
    db = TestingSessionLocal()
    try:
        command = _make_command(db)
        PCS.set_line_detail(db, command.id, "k1", quantity_to_order=10)
        assert PCS.get_line_details(db, command.id)["k1"].quantity_to_order == 10

        # Nouvel appel avec None => l'override est effacé (retour au calcul).
        PCS.set_line_detail(db, command.id, "k1", quantity_to_order=None)
        assert PCS.get_line_details(db, command.id)["k1"].quantity_to_order is None
    finally:
        db.close()


def test_set_line_detail_upsert_is_idempotent_on_key():
    db = TestingSessionLocal()
    try:
        command = _make_command(db)
        PCS.set_line_detail(db, command.id, "k1", note="a")
        PCS.set_line_detail(db, command.id, "k1", note="b")
        details = PCS.get_line_details(db, command.id)
        assert len(details) == 1
        assert details["k1"].note == "b"
    finally:
        db.close()
