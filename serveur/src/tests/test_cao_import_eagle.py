"""Parseur CAO Eagle — non-régression sur fixtures OTR (prompt 003 / E02).

Valide (a) l'extraction complète depuis le `.brd` (60 composants, faces, MPN) et
(b) la transformation carte → machine sur les références communes au `.brd` et
aux fichiers machine attendus. Conformément à E02 : le parseur extrait **tout**,
et le test ne hard-fail **pas** sur C1/C4 (absents du fichier machine = curation).
KiCad est hors périmètre (détection seulement).
"""

import os
import xml.etree.ElementTree as ET

from src.services.cao.detect import detect_cao
from src.services.cao.parser_eagle import EagleParser

FIX = os.path.join(os.path.dirname(__file__), "fixtures", "eagle_otr")
BRD = os.path.join(FIX, "OTR.brd")
SCH = os.path.join(FIX, "OTR.sch")
MACHINE_TOP = os.path.join(FIX, "OTR_machine_TOP.txt")
MACHINE_BOT = os.path.join(FIX, "OTR_machine_BOT.txt")


def _machine_rows(path):
    rows = []
    with open(path, encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            parts = line.split()
            # Réf Valeur Empreinte X Y Angle Face
            rows.append({
                "ref": parts[0], "value": parts[1], "footprint": parts[2],
                "x": float(parts[3]), "y": float(parts[4]),
                "angle": int(parts[5]), "face": parts[6],
            })
    return rows


def _flip_height():
    return EagleParser.flip_height(ET.parse(BRD).getroot())


# ── Détection ────────────────────────────────────────────────────────────────
def test_detect_eagle_pairs_board_and_schematic():
    detected = detect_cao(["OTR.sch", "OTR.brd", "notes.txt"])
    assert detected["kind"] == "eagle"
    assert detected["supported"] is True
    assert detected["board"] == "OTR.brd"
    assert detected["schematic"] == "OTR.sch"


def test_detect_kicad_is_recognized_but_reported():
    detected = detect_cao(["board.kicad_pcb", "board.kicad_sch"])
    assert detected["kind"] == "kicad"
    assert detected["supported"] is False
    assert "venir" in detected["message"].lower()


def test_detect_none_when_no_cao_files():
    assert detect_cao(["readme.md", "bom.xlsx"]) is None


# ── Extraction complète ──────────────────────────────────────────────────────
def test_parse_extracts_all_60_components():
    comps = EagleParser.parse(BRD, SCH)
    assert len(comps) == 60
    # 59 avec valeur + 1 logo sans valeur (U$1).
    without_value = [c for c in comps if not c["value_raw"]]
    assert len(without_value) == 1
    top = sum(1 for c in comps if c["placement_side"] == "top")
    bottom = sum(1 for c in comps if c["placement_side"] == "bottom")
    assert top + bottom == 60


def test_flip_height_from_contour_is_3420():
    assert abs(_flip_height() - 34.20) < 0.01


def test_mpn_enriched_from_schematic():
    comps = EagleParser.parse(BRD, SCH)
    with_mpn = [c for c in comps if c["mpn"]]
    assert len(with_mpn) >= 3  # ICs / connecteurs


# ── Transformation carte → machine (référence de placement) ──────────────────
def test_transform_matches_machine_reference():
    by_ref = {c["reference_item"]: c for c in EagleParser.parse(BRD, SCH)}
    height = _flip_height()
    expected = _machine_rows(MACHINE_TOP) + _machine_rows(MACHINE_BOT)
    assert len(expected) == 49  # 2 top + 47 bottom

    for row in expected:
        comp = by_ref.get(row["ref"])
        assert comp is not None, f"{row['ref']} extrait absent"
        placed = EagleParser.to_machine_placement(comp, height)
        assert placed["face"] == row["face"], row["ref"]
        assert placed["value"] == row["value"], row["ref"]
        assert placed["footprint"] == row["footprint"], row["ref"]
        assert abs(placed["x"] - round(row["x"], 2)) < 0.011, f"{row['ref']} x"
        assert abs(placed["y"] - round(row["y"], 2)) < 0.011, f"{row['ref']} y"
        assert placed["angle"] == row["angle"], f"{row['ref']} angle"
