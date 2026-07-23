"""Prompt 021 — séparateur réf/nom tolérant + rapport des dossiers ignorés (raison).

- ``parse_card_folder`` accepte tiret / underscore / tiret long / espace(s) et la
  référence seule (nom vide), sans régresser le format historique « KT.. - .. » ;
- ``scan_catalogue`` classe les dossiers écartés avec une raison
  (not_a_card / unrecognized_format / no_revision) et importe la référence seule.
"""
import os
import shutil

from src.services.catalogue_import_service import (
    parse_card_folder,
    scan_catalogue,
    SKIP_LABELS,
)

EAGLE_FIX = os.path.join(os.path.dirname(__file__), "fixtures", "eagle_otr")


def _make_conception(root, card_folder, rev, files):
    conception = os.path.join(root, card_folder, f"Rev.{rev}", "Conception")
    os.makedirs(conception, exist_ok=True)
    for target, source in files:
        dest = os.path.join(conception, target)
        if source is None:
            open(dest, "w").close()
        else:
            shutil.copyfile(source, dest)


def _eagle_files():
    return [("OTR.brd", os.path.join(EAGLE_FIX, "OTR.brd")),
            ("OTR.sch", os.path.join(EAGLE_FIX, "OTR.sch"))]


# -- parse_card_folder : separateurs tolerants --------------------------------

def test_parse_separateur_espace():
    assert parse_card_folder("KT190300 MPX 1.0") == ("KT190300", "MPX 1.0")


def test_parse_nom_avec_underscores():
    assert parse_card_folder("KT220348 opt_sensor_PMT9101") == ("KT220348", "opt_sensor_PMT9101")
    assert parse_card_folder("KT220863A Rotary_Supply_Control") == ("KT220863A", "Rotary_Supply_Control")


def test_parse_nom_avec_tiret_interne_non_regresse():
    assert parse_card_folder("KT180241 - Carrier Board XAAR 5601 - 117FC") == (
        "KT180241", "Carrier Board XAAR 5601 - 117FC")
    assert parse_card_folder("KT190562 - NanoSH MK2") == ("KT190562", "NanoSH MK2")


def test_parse_tiret_long_et_underscore_separateur():
    assert parse_card_folder("KT123 — Nom") == ("KT123", "Nom")
    assert parse_card_folder("KT124_Nom") == ("KT124", "Nom")


def test_parse_reference_seule_nom_vide():
    assert parse_card_folder("KT200026") == ("KT200026", "")
    assert parse_card_folder("KT260009A FLASH-100") == ("KT260009A", "FLASH-100")


def test_parse_non_carte():
    assert parse_card_folder("Archives") is None
    assert parse_card_folder("") is None


# -- scan_catalogue : import ref seule + rapport avec raisons ------------------

def test_scan_importe_reference_seule_et_classe_les_ignores(tmp_path):
    root = str(tmp_path)
    _make_conception(root, "KT190300 MPX 1.0", "A", _eagle_files())
    _make_conception(root, "KT200026", "A", _eagle_files())
    os.makedirs(os.path.join(root, "Archives"), exist_ok=True)
    os.makedirs(os.path.join(root, "KT400004 SansRev"), exist_ok=True)

    scan = scan_catalogue(root)

    refs = {c.reference: c for c in scan.cards}
    assert "KT190300" in refs and refs["KT190300"].name == "MPX 1.0"
    assert "KT200026" in refs and refs["KT200026"].name == ""

    reasons = {d.name: d.reason for d in scan.skipped}
    assert reasons.get("Archives") == "not_a_card"
    assert reasons.get("KT400004 SansRev") == "no_revision"
    for d in scan.skipped:
        assert d.label == SKIP_LABELS[d.reason]
    assert "Archives" in scan.skipped_dirs
