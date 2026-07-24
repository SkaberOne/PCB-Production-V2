"""Import en masse du catalogue (prompt 011).

Deux niveaux :
  - unitaire pur : ``scan_catalogue`` sur une arborescence construite en
    ``tmp_path`` (aucune DB) — extraction réf/nom/révision, détection Eagle vs
    KiCad, tolérance aux dossiers hors convention (``skipped_dirs``) ;
  - bout-en-bout : endpoint ``POST /api/bom/import-catalogue`` en aperçu
    (``dry_run``) puis import réel, en réutilisant la fixture Eagle vérifiée
    ``eagle_otr`` (OTR.brd/OTR.sch) copiée dans un arbre catalogue, plus
    l'idempotence (2e passage → révisions ignorées).
"""

import os
import shutil

from src.services.catalogue_import_service import parse_card_folder, scan_catalogue

from src.models.bom import BomReference
from .conftest import client, TestingSessionLocal
from src.services.stock_service import StockService


def _configure_root(path):
    """Fixe la racine projets configurée (l'endpoint confine root_path dessous)."""
    with TestingSessionLocal() as s:
        StockService.set_projects_root_path(s, str(path))

EAGLE_FIX = os.path.join(os.path.dirname(__file__), "fixtures", "eagle_otr")


def _ref_exists(reference):
    db = TestingSessionLocal()
    try:
        return db.query(BomReference).filter(BomReference.reference == reference).first() is not None
    finally:
        db.close()


def _make_conception(root, card_folder, rev, files):
    """Crée ``<root>/<card_folder>/Rev.<rev>/Conception`` et y dépose les fichiers.

    ``files`` : liste de (nom_cible, chemin_source | None). ``None`` = fichier
    vide (dummy) ; sinon copie depuis le chemin source.
    """
    conception = os.path.join(root, card_folder, f"Rev.{rev}", "Conception")
    os.makedirs(conception, exist_ok=True)
    for target, source in files:
        dest = os.path.join(conception, target)
        if source is None:
            open(dest, "w").close()
        else:
            shutil.copyfile(source, dest)
    return conception


def _eagle_files():
    return [("OTR.brd", os.path.join(EAGLE_FIX, "OTR.brd")),
            ("OTR.sch", os.path.join(EAGLE_FIX, "OTR.sch"))]


# ── Parsing du nom de dossier carte ──────────────────────────────────────────
def test_parse_card_folder_extracts_reference_and_name():
    assert parse_card_folder("KT190562 - NanoSH MK2") == ("KT190562", "NanoSH MK2")
    assert parse_card_folder("KT12A - Une carte") == ("KT12A", "Une carte")
    assert parse_card_folder("Archives") is None
    assert parse_card_folder("") is None


# ── Scan pur (sans DB) ───────────────────────────────────────────────────────
def test_scan_catalogue_structure(tmp_path):
    root = str(tmp_path)
    _make_conception(root, "KT190562 - NanoSH MK2", "A", _eagle_files())
    _make_conception(root, "KT190562 - NanoSH MK2", "B", _eagle_files())
    _make_conception(root, "KT200001 - KiCad Board", "A",
                     [("board.kicad_pcb", None), ("board.kicad_sch", None)])
    _make_conception(root, "KT300003 - Empty", "A", [])  # Conception vide
    # Hors convention : ni KT..., ni Rev.X
    os.makedirs(os.path.join(root, "Archives", "old"), exist_ok=True)
    os.makedirs(os.path.join(root, "KT400004 - NoRev", "random"), exist_ok=True)

    scan = scan_catalogue(root)
    assert scan.exists is True
    cards = {c.reference: c for c in scan.cards}

    # Carte Eagle, 2 révisions importables
    nano = cards["KT190562"]
    assert nano.name == "NanoSH MK2"
    revs = {r.revision: r for r in nano.revisions}
    assert set(revs) == {"A", "B"}
    assert revs["A"].kind == "eagle" and revs["A"].supported is True

    # KiCad : listé, non supporté
    kicad = cards["KT200001"].revisions[0]
    assert kicad.kind == "kicad" and kicad.supported is False

    # Conception vide : révision présente mais non supportée
    empty = cards["KT300003"].revisions[0]
    assert empty.supported is False

    # Hors convention → skipped
    assert "Archives" in scan.skipped_dirs
    assert "KT400004 - NoRev" in scan.skipped_dirs


def test_scan_catalogue_missing_root():
    scan = scan_catalogue("/chemin/qui/nexiste/pas")
    assert scan.exists is False
    assert scan.cards == []


# ── Endpoint : aperçu (dry_run) ──────────────────────────────────────────────
def test_import_catalogue_dry_run_reports_without_writing(tmp_path):
    root = str(tmp_path)
    _make_conception(root, "KT190562 - NanoSH MK2", "A", _eagle_files())
    _make_conception(root, "KT200001 - KiCad Board", "A",
                     [("board.kicad_pcb", None), ("board.kicad_sch", None)])
    _configure_root(root)

    resp = client.post("/api/bom/import-catalogue",
                       params={"dry_run": True, "root_path": root})
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["dry_run"] is True
    assert data["cards_scanned"] == 2
    assert data["revisions_imported"] == 0  # aperçu : rien d'écrit
    statuses = {(r["reference"], r["revision"]): r["status"] for r in data["rows"]}
    assert statuses[("KT190562", "A")] == "importable"
    assert statuses[("KT200001", "A")] == "kicad"

    # Aucune BOM créée par l'aperçu
    assert _ref_exists("KT190562") is False


# ── Endpoint : import réel + idempotence ─────────────────────────────────────
def test_import_catalogue_real_then_idempotent(tmp_path):
    root = str(tmp_path)
    _make_conception(root, "KT190562 - NanoSH MK2", "A", _eagle_files())
    _configure_root(root)

    first = client.post("/api/bom/import-catalogue",
                        params={"dry_run": False, "root_path": root})
    assert first.status_code == 200, first.text
    d1 = first.json()
    assert d1["revisions_imported"] >= 1
    row = next(r for r in d1["rows"] if r["reference"] == "KT190562")
    assert row["status"] == "imported"

    # La BOM existe maintenant
    assert _ref_exists("KT190562") is True

    # 2e passage : révision déjà en base → ignorée, rien de réimporté
    second = client.post("/api/bom/import-catalogue",
                         params={"dry_run": False, "root_path": root})
    assert second.status_code == 200, second.text
    d2 = second.json()
    assert d2["revisions_imported"] == 0
    row2 = next(r for r in d2["rows"] if r["reference"] == "KT190562")
    assert row2["status"] == "ignored"


def test_import_catalogue_requires_root(tmp_path):
    # Ni override ni réglage configuré → 422 explicite.
    resp = client.post("/api/bom/import-catalogue",
                       params={"dry_run": True, "root_path": ""})
    assert resp.status_code == 422


# ── Endpoint : aperçu annonce « à importer » (prompt 026) ────────────────────
def test_import_catalogue_dry_run_annonce_a_importer(tmp_path):
    """L'aperçu doit annoncer un nombre NON NUL de révisions à importer, égal à
    ce que fera l'import réel immédiat, sans rien écrire (prompt 026)."""
    root = str(tmp_path)
    _make_conception(root, "KT190562 - NanoSH MK2", "A", _eagle_files())
    _make_conception(root, "KT190562 - NanoSH MK2", "B", _eagle_files())
    _make_conception(root, "KT200001 - KiCad Board", "A",
                     [("board.kicad_pcb", None), ("board.kicad_sch", None)])
    _configure_root(root)

    # Aperçu : 2 révisions Eagle absentes → a_importer == 2 (KiCad exclu).
    preview = client.post("/api/bom/import-catalogue",
                          params={"dry_run": True, "root_path": root})
    assert preview.status_code == 200, preview.text
    p = preview.json()
    importable = [r for r in p["rows"] if r["status"] == "importable"]
    assert p["a_importer"] == 2
    assert p["a_importer"] == len(importable)
    detail_keys = {(d["reference"], d["revision"]) for d in p["a_importer_details"]}
    assert detail_keys == {("KT190562", "A"), ("KT190562", "B")}
    # Aperçu = aucune écriture DB.
    assert _ref_exists("KT190562") is False

    # Import réel : le nombre importé coïncide avec l'aperçu.
    real = client.post("/api/bom/import-catalogue",
                       params={"dry_run": False, "root_path": root})
    assert real.status_code == 200, real.text
    assert real.json()["revisions_imported"] == p["a_importer"]

    # Idempotence : nouvel aperçu → plus rien à importer.
    again = client.post("/api/bom/import-catalogue",
                        params={"dry_run": True, "root_path": root})
    assert again.status_code == 200, again.text
    a = again.json()
    assert a["a_importer"] == 0
    assert a["a_importer_details"] == []


def test_import_catalogue_dry_run_exclut_cao_illisible(tmp_path):
    """Aperçu et import réel donnent le MÊME verdict sur un CAO illisible : la
    révision corrompue est « error » (pas « à importer »), donc a_importer ne
    compte que ce que l'import saura vraiment importer (prompt 026)."""
    root = str(tmp_path)
    _make_conception(root, "KT190562 - NanoSH MK2", "A", _eagle_files())
    broken = _make_conception(root, "KT999999 - Corrompue", "A", _eagle_files())
    # Corrompt les fichiers CAO → XML non valide, comme un fichier réel abîmé.
    for fname in ("OTR.brd", "OTR.sch"):
        with open(os.path.join(broken, fname), "w", encoding="utf-8") as fh:
            fh.write("<?xml version='1.0'?><eagle><bad token=></eagle>")
    _configure_root(root)

    preview = client.post("/api/bom/import-catalogue",
                          params={"dry_run": True, "root_path": root})
    assert preview.status_code == 200, preview.text
    p = preview.json()
    statuses = {(r["reference"], r["revision"]): r["status"] for r in p["rows"]}
    assert statuses[("KT190562", "A")] == "importable"
    assert statuses[("KT999999", "A")] == "error"     # illisible → pas « à importer »
    assert p["a_importer"] == 1                        # seule la carte valide

    real = client.post("/api/bom/import-catalogue",
                       params={"dry_run": False, "root_path": root})
    d = real.json()
    assert d["revisions_imported"] == p["a_importer"] == 1  # coïncidence exacte
    rstat = {(r["reference"], r["revision"]): r["status"] for r in d["rows"]}
    assert rstat[("KT999999", "A")] == "error"
