"""Endpoint d'import CAO par dossier — non-régression (prompt 006 / 003 incr.2).

Vérifie le branchement du parseur Eagle (003) sur la chaîne d'import/harmonisation
existante via ``POST /bom/import-cao`` : un revision par face, items harmonisés,
centroïde correct, détection KiCad reportée, garde-fous (aucun CAO).
"""

import os

from src.services.cao.cao_import_service import prepare_cao_import
from src.tests.conftest import client

FIX = os.path.join(os.path.dirname(__file__), "fixtures", "eagle_otr")
BRD = os.path.join(FIX, "OTR.brd")
SCH = os.path.join(FIX, "OTR.sch")


def _brd_bytes():
    with open(BRD, "rb") as handle:
        return handle.read()


def _sch_bytes():
    with open(SCH, "rb") as handle:
        return handle.read()


def _find_item(items, reference):
    return next((item for item in items if item.get("reference") == reference), None)


# ── Service (unitaire, sans HTTP) ─────────────────────────────────────────────
def test_prepare_splits_faces_and_matches_machine_reference(tmp_path):
    board = tmp_path / "OTR.brd"
    schematic = tmp_path / "OTR.sch"
    board.write_bytes(_brd_bytes())
    schematic.write_bytes(_sch_bytes())

    prep = prepare_cao_import({"OTR.brd": str(board), "OTR.sch": str(schematic)})
    assert prep is not None
    assert prep.kind == "eagle" and prep.supported is True
    sides = {face.side for face in prep.faces}
    assert sides == {"TOP", "BOT"}

    top_text = next(face.text for face in prep.faces if face.side == "TOP")
    # LED10 est un composant top placé, coordonnées machine de référence.
    assert "LED10 LTST-C190KRKT CHIPLED_0603 49.36 28.14 270 T" in top_text.splitlines()

    bot_text = next(face.text for face in prep.faces if face.side == "BOT")
    assert "C2 100nF C0603 56.31 9.94 90 B" in bot_text.splitlines()


# ── Endpoint ──────────────────────────────────────────────────────────────────
def test_import_cao_creates_revision_per_face():
    response = client.post(
        "/api/bom/import-cao",
        params={"reference": "OTR-CAO", "revision": "REV_A"},
        files=[
            ("files", ("OTR.brd", _brd_bytes(), "application/octet-stream")),
            ("files", ("OTR.sch", _sch_bytes(), "application/octet-stream")),
        ],
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["success"] is True
    assert payload["kind"] == "eagle" and payload["supported"] is True
    assert set(payload["faces"]) == {"TOP", "BOT"}
    assert len(payload["revisions"]) == 2

    by_side = {rev["side"]: rev for rev in payload["revisions"]}
    top = by_side["TOP"]
    bot = by_side["BOT"]
    assert top["item_count"] > 0 and bot["item_count"] > 0

    led10 = _find_item(top["items"], "LED10")
    assert led10 is not None
    assert led10["footprint_eagle"] == "CHIPLED_0603"
    assert abs(led10["x"] - 49.36) < 0.011
    assert abs(led10["y"] - 28.14) < 0.011
    assert led10["rotation"] == 270
    assert led10["placement_side"] == "TOP"
    # Harmonisation : LED (ni R ni C) → valeur inchangée.
    assert led10["value_harmonized"] == "LTST-C190KRKT"

    c2 = _find_item(bot["items"], "C2")
    assert c2 is not None
    assert c2["placement_side"] == "BOT"
    assert c2["rotation"] == 90
    # Condensateur : 100nF conservé (déjà harmonisé).
    assert c2["value_harmonized"] == "100nF"


def test_import_cao_missing_schematic_warns_but_succeeds():
    response = client.post(
        "/api/bom/import-cao",
        params={"reference": "OTR-NOSCH", "revision": "REV_A"},
        files=[("files", ("OTR.brd", _brd_bytes(), "application/octet-stream"))],
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["success"] is True
    assert any("MPN" in warning for warning in payload["warnings"])


def test_import_cao_kicad_is_reported_not_crashed():
    response = client.post(
        "/api/bom/import-cao",
        params={"reference": "KI", "revision": "REV_A"},
        files=[
            ("files", ("board.kicad_pcb", b"(kicad_pcb)", "application/octet-stream")),
            ("files", ("board.kicad_sch", b"(kicad_sch)", "application/octet-stream")),
        ],
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["success"] is False
    assert payload["supported"] is False
    assert payload["kind"] == "kicad"
    assert "venir" in payload["message"].lower()
    assert payload["revisions"] == []


def test_import_cao_rejects_when_no_cao_file():
    response = client.post(
        "/api/bom/import-cao",
        params={"reference": "NOPE", "revision": "REV_A"},
        files=[("files", ("notes.txt", b"hello", "text/plain"))],
    )
    assert response.status_code == 422
