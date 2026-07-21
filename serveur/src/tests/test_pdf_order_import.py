"""Tests : import d'une commande client PDF (ADR 0018).

Utilise le vrai bon de commande SPEOS (fixtures/commande_speos.pdf)."""

import os

from .conftest import TestingSessionLocal

from src.models.bom import BomReference
from src.services.card_catalog_service import CardCatalogService
from src.services.pdf_order_import_service import PdfOrderImportService, parse_order_pdf

FIXTURE = os.path.join(os.path.dirname(__file__), "fixtures", "commande_speos.pdf")


def _pdf_bytes():
    with open(FIXTURE, "rb") as f:
        return f.read()


def test_parse_extracts_client_and_lines():
    parsed = parse_order_pdf(_pdf_bytes())
    assert parsed["client_name"] == "SPEOS"
    assert parsed["order_reference"] == "CO2601-10180"
    by_pn = {l["part_number"]: l for l in parsed["lines"]}
    # 7 lignes codées ; « Frais de livraison » (sans code) ignoré.
    assert len(parsed["lines"]) == 7
    assert by_pn["KT240576"]["revision"] == "A"
    assert by_pn["KT240576"]["name"] == "OTR BOARD BICOLOR"
    assert by_pn["KT240576"]["quantity"] == 4
    assert by_pn["KTE140007"]["revision"] == "F"
    assert by_pn["KTE140007"]["quantity"] == 1


def test_preview_matches_known_part_numbers():
    db = TestingSessionLocal()
    otr = BomReference(reference="OTR board Bicolor", part_number="KT240576")
    db.add(otr)
    db.commit()
    preview = PdfOrderImportService.preview(db, _pdf_bytes())
    assert preview["client_name"] == "SPEOS"
    matched_pn = {m["part_number"] for m in preview["matched"]}
    unmatched_pn = {u["part_number"] for u in preview["unmatched"]}
    assert "KT240576" in matched_pn
    # les autres codes ne sont pas encore rattachés
    assert "KTE140007" in unmatched_pn
    otr_line = next(m for m in preview["matched"] if m["part_number"] == "KT240576")
    assert otr_line["bom_reference_id"] == otr.id
    db.close()


def test_commit_maps_unknown_code_and_creates_order():
    db = TestingSessionLocal()
    otr = BomReference(reference="OTR board Bicolor", part_number="KT240576")
    control = BomReference(reference="Control board")  # pas encore de code
    db.add_all([otr, control])
    db.commit()

    # Mappe le code inconnu KTE140007 -> Control board ; commande 2 cartes.
    order = PdfOrderImportService.commit(
        db,
        client_name="SPEOS",
        lines=[
            {"bom_reference_id": otr.id, "revision": "A", "quantity": 4},
            {"bom_reference_id": control.id, "revision": "F", "quantity": 1},
        ],
        mappings=[{"part_number": "KTE140007", "bom_reference_id": control.id}],
    )
    assert order["reference"].startswith("CMD-")
    by_ref = {l["bom_reference_id"]: l for l in order["lines"]}
    assert by_ref[otr.id]["quantity"] == 4
    assert by_ref[otr.id]["revision"] == "A"
    assert by_ref[control.id]["revision"] == "F"
    # Le mapping a été mémorisé sur la carte.
    assert CardCatalogService.find_by_part_number(db, "KTE140007").id == control.id
    db.close()


def test_external_reference_stored_and_duplicate_flagged():
    db = TestingSessionLocal()
    otr = BomReference(reference="OTR board Bicolor", part_number="KT240576")
    db.add(otr)
    db.commit()

    # 1er import : pas encore vu.
    prev1 = PdfOrderImportService.preview(db, _pdf_bytes())
    assert prev1["order_reference"] == "CO2601-10180"
    assert prev1["already_imported"] is False

    order = PdfOrderImportService.commit(
        db,
        client_name="SPEOS",
        lines=[{"bom_reference_id": otr.id, "revision": "A", "quantity": 4}],
        order_reference="CO2601-10180",
    )
    assert order["external_reference"] == "CO2601-10180"

    # 2e aperçu du même bon : signalé comme déjà importé.
    prev2 = PdfOrderImportService.preview(db, _pdf_bytes())
    assert prev2["already_imported"] is True
    assert prev2["already_imported_as"] == order["reference"]
    db.close()
