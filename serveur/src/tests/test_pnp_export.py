"""Tests unitaires de l'export PnP (référentiel colonnes + construction CSV/TXT).

Pas de base de données : on valide la logique pure avec des objets factices
(SimpleNamespace) jouant le rôle de BomItem / Component.
"""

from types import SimpleNamespace

from src.utils.pnp_export import (
    DEFAULT_COLUMN_IDS,
    normalize_columns,
    normalize_format,
    normalize_separator,
)
from src.services.pnp_export_service import (
    _build_csv,
    _build_txt,
    _normalize_side,
    build_pnp_export,
)


def _bom_item(**kw):
    base = dict(
        reference_item="",
        value_harmonized=None,
        value_raw=None,
        footprint_pnp=None,
        x=None,
        y=None,
        rotation=None,
        placement_side=None,
        quantity=1,
        notes=None,
        dnp=False,
    )
    base.update(kw)
    return SimpleNamespace(**base)


def _component(**kw):
    base = dict(id=1, value=None, footprint_pnp=None, package=None, component_type=None)
    base.update(kw)
    return SimpleNamespace(**base)


# ── Référentiel colonnes ────────────────────────────────────────────────────

def test_normalize_columns_defaults_when_empty():
    assert normalize_columns(None) == DEFAULT_COLUMN_IDS
    assert normalize_columns([]) == DEFAULT_COLUMN_IDS


def test_normalize_columns_injects_required():
    # Aucune colonne obligatoire fournie : elles sont préfixées dans l'ordre canonique.
    result = normalize_columns(["nozzle", "feeder"])
    assert result[:5] == ["position", "name", "footprint", "x", "y"]
    assert result[-2:] == ["nozzle", "feeder"]


def test_normalize_columns_dedupe_and_drop_unknown():
    result = normalize_columns(["x", "x", "BOGUS", "y", "position", "name", "footprint"])
    assert result == ["x", "y", "position", "name", "footprint"]


def test_normalize_format_and_separator():
    assert normalize_format("txt") == "TXT"
    assert normalize_format(None) == "CSV"
    assert normalize_format("xml") == "CSV"
    assert normalize_separator(";") == ";"
    assert normalize_separator("foo") == ","


# ── Normalisation face ──────────────────────────────────────────────────────

def test_normalize_side():
    assert _normalize_side("TOP") == "Top"
    assert _normalize_side("BOT") == "Bottom"
    assert _normalize_side("bottom") == "Bottom"
    assert _normalize_side("") == ""


# ── Construction CSV ────────────────────────────────────────────────────────

def test_build_csv_headers_values_and_quoting():
    comp_c = _component(id=10, value="100uF", footprint_pnp="PANASONIC", component_type="Capacitor")
    comp_r = _component(id=20, value="10k", footprint_pnp="0603", component_type="Resistor")
    rows = [
        (_bom_item(reference_item="C1", value_harmonized="100uF", footprint_pnp="PANASONIC",
                   x=-134.62, y=23.18, rotation=0, placement_side="TOP"), comp_c),
        (_bom_item(reference_item="R1", value_harmonized="10k", footprint_pnp="0603",
                   x=-155.27, y=16.35, rotation=90, placement_side="BOT", notes="a,b"), comp_r),
    ]
    assignment_by_component = {
        10: {"slot_start": 1, "nozzle_type": 505},
        20: {"slot_start": 2, "nozzle_type": 502},
    }
    columns = ["position", "name", "footprint", "x", "y", "angle", "side", "feeder", "nozzle", "group", "comment"]
    out = _build_csv(rows, columns, ",", assignment_by_component)
    lines = out.strip().splitlines()
    assert lines[0] == "Position,Component Name,Footprint,X,Y,Angle,Top/Bottom,Feeder,Nozzle,Group,Comment"
    assert lines[1] == "C1,100uF,PANASONIC,-134.62,23.18,0,Top,1,505,Capacitor,"
    # La virgule dans le commentaire doit être protégée par des guillemets.
    assert lines[2] == 'R1,10k,0603,-155.27,16.35,90,Bottom,2,502,Resistor,"a,b"'


def test_build_csv_semicolon_separator_and_blank_feeder():
    comp = _component(id=5, value="1k", footprint_pnp="0402")
    rows = [(_bom_item(reference_item="R9", value_harmonized="1k", footprint_pnp="0402",
                       x=1.0, y=2.0, rotation=0, placement_side="TOP"), comp)]
    # Composant sans affectation feeder → colonnes Feeder/Nozzle vides.
    out = _build_csv(rows, ["position", "feeder", "nozzle"], ";", {})
    lines = out.strip().splitlines()
    assert lines[0] == "Position;Feeder;Nozzle"
    assert lines[1] == "R9;;"


def test_build_csv_number_formatting_no_float_artifact():
    comp = _component(id=1)
    rows = [(_bom_item(reference_item="C1", value_harmonized="x", footprint_pnp="f",
                       x=0.1 + 0.2, y=7.7, rotation=180, placement_side="TOP"), comp)]
    out = _build_csv(rows, ["x", "y", "angle"], ",", {})
    # 0.1+0.2 ne doit pas fuir en 0.30000000000000004.
    assert out.strip().splitlines()[1] == "0.3,7.7,180"


# ── Construction TXT (BOM agrégée) ──────────────────────────────────────────

def test_build_txt_aggregates_by_value_and_footprint():
    comp_r = _component(id=20, value="10k", footprint_pnp="0603")
    rows = [
        (_bom_item(reference_item="R2", value_harmonized="10k", footprint_pnp="0603", quantity=1), comp_r),
        (_bom_item(reference_item="R1", value_harmonized="10k", footprint_pnp="0603", quantity=1), comp_r),
        (_bom_item(reference_item="C1", value_harmonized="100uF", footprint_pnp="PANASONIC", quantity=1),
         _component(id=10, value="100uF", footprint_pnp="PANASONIC")),
    ]
    out = _build_txt(rows)
    lines = out.strip().splitlines()
    assert lines[0] == "Reference\tValeur\tEmpreinte harmonisee\tQte"
    # R1/R2 regroupés (refs triées), quantité sommée à 2.
    assert "R1 R2\t10k\t0603\t2" in lines
    assert "C1\t100uF\tPANASONIC\t1" in lines


# ── build_pnp_export : choix de format / nom de fichier ─────────────────────

def test_build_pnp_export_txt_filename_and_media(monkeypatch):
    machine = SimpleNamespace(name="SMT 1010", export_format="CSV", export_columns=None, export_separator=None)
    production = SimpleNamespace(name="Carte A", bom_links=[])
    # Override format → TXT ; pas de lignes (bom_links vide) mais l'en-tête doit sortir.
    monkeypatch.setattr("src.services.pnp_export_service._iter_export_items", lambda db, prod, rev: [])
    filename, media_type, content = build_pnp_export(
        db=None, machine=machine, production=production, export_format="TXT",
    )
    assert filename == "SMT_1010_Carte_A_pnp.txt"
    assert media_type.startswith("text/plain")
    assert content.startswith("Reference\tValeur")


def test_build_pnp_export_csv_uses_machine_config(monkeypatch):
    machine = SimpleNamespace(
        name="M1", export_format="CSV",
        export_columns='["position", "x", "y"]', export_separator=";",
    )
    production = SimpleNamespace(name="P1", bom_links=[])
    monkeypatch.setattr("src.services.pnp_export_service._iter_export_items", lambda db, prod, rev: [])
    filename, media_type, content = build_pnp_export(
        db=None, machine=machine, production=production,
    )
    assert filename == "M1_P1_pnp.csv"
    assert media_type.startswith("text/csv")
    # Colonnes obligatoires manquantes (name, footprint) réinjectées EN TÊTE,
    # dans l'ordre canonique, avant les colonnes fournies ; séparateur ';'.
    assert content.strip().splitlines()[0] == "Component Name;Footprint;Position;X;Y"
