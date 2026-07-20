"""Tests unitaires de l'export PnP (référentiel colonnes + construction CSV/TXT).

Pas de base de données : on valide la logique pure avec des objets factices
(SimpleNamespace) jouant le rôle de BomItem / Component.
"""

from types import SimpleNamespace

from src.utils.pnp_export import (
    DEFAULT_COLUMN_IDS,
    normalize_back_order,
    normalize_columns,
    normalize_format,
    normalize_separator,
    physical_feeder_number,
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


# ── Numérotation rail arrière (physical_feeder_number) ──────────────────────

def test_normalize_back_order():
    assert normalize_back_order(None) == "ASC"
    assert normalize_back_order("desc") == "DESC"
    assert normalize_back_order("ASC") == "ASC"
    assert normalize_back_order("bogus") == "ASC"


def test_physical_feeder_number_front_unchanged():
    # Avant (1..40) inchangé quel que soit le sens arrière.
    assert physical_feeder_number(1, 80, "ASC") == 1
    assert physical_feeder_number(40, 80, "DESC") == 40


def test_physical_feeder_number_back_asc_is_linear():
    assert physical_feeder_number(41, 80, "ASC") == 41
    assert physical_feeder_number(80, 80, "ASC") == 80


def test_physical_feeder_number_back_desc_reversed():
    # Arrière inversé : colonne gauche (linéaire 41) = 80, colonne droite (80) = 41.
    assert physical_feeder_number(41, 80, "DESC") == 80
    assert physical_feeder_number(80, 80, "DESC") == 41
    assert physical_feeder_number(60, 80, "DESC") == 61


def test_physical_feeder_number_guards():
    assert physical_feeder_number(None, 80, "ASC") is None
    assert physical_feeder_number(5, 0, "ASC") == 5  # num_positions inconnu → inchangé


def test_build_csv_back_order_desc_maps_feeder():
    comp = _component(id=1, value="x", footprint_pnp="f")
    rows = [(_bom_item(reference_item="U1", value_harmonized="x", footprint_pnp="f",
                       x=0, y=0, rotation=0, placement_side="TOP"), comp)]
    assignment_by_component = {1: {"slot_start": 41, "nozzle_type": 504}}
    out = _build_csv(rows, ["position", "feeder"], ",", assignment_by_component,
                     num_positions=80, back_order="DESC")
    # Feeder arrière le plus à gauche (linéaire 41) → numéro physique 80.
    assert out.strip().splitlines()[1] == "U1,80"


def test_build_pnp_export_csv_applies_back_order(monkeypatch):
    machine = SimpleNamespace(
        name="M2", num_positions=80, feeder_back_order="DESC",
        export_format="CSV", export_columns='["position", "feeder"]', export_separator=",",
    )
    production = SimpleNamespace(name="P", bom_links=[])
    comp = _component(id=7)
    rows = [(_bom_item(reference_item="U7", value_harmonized="x", footprint_pnp="f",
                       x=0, y=0, rotation=0, placement_side="TOP"), comp)]
    monkeypatch.setattr("src.services.pnp_export_service._iter_export_items", lambda db, prod, rev: rows)
    _filename, _media, content = build_pnp_export(
        db=None, machine=machine, production=production,
        assignment_by_component={7: {"slot_start": 80, "nozzle_type": 505}},
    )
    # normalize_columns réinjecte les colonnes obligatoires en tête (name, footprint,
    # x, y) avant position+feeder. Linéaire 80 (arrière droite) en DESC → 41.
    assert content.strip().splitlines()[1].endswith("U7,41")


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


def test_build_csv_excludes_manual_placement_components():
    # Composant sans affectation feeder (posé à la main) → absent du fichier PnP.
    manual = _component(id=5, value="CONN", footprint_pnp="CONNECTEUR")
    placed = _component(id=6, value="1k", footprint_pnp="0402")
    rows = [
        (_bom_item(reference_item="J1", value_harmonized="CONN", footprint_pnp="CONNECTEUR",
                   x=1.0, y=2.0, rotation=0, placement_side="TOP"), manual),
        (_bom_item(reference_item="R9", value_harmonized="1k", footprint_pnp="0402",
                   x=1.0, y=2.0, rotation=0, placement_side="TOP"), placed),
    ]
    assignment_by_component = {6: {"slot_start": 12, "nozzle_type": 503}}
    out = _build_csv(rows, ["position", "feeder", "nozzle"], ";", assignment_by_component)
    lines = out.strip().splitlines()
    assert lines[0] == "Position;Feeder;Nozzle"
    # Seul R9 (affecté) est exporté ; J1 (manuel) est exclu.
    assert lines[1:] == ["R9;12;503"]


def test_build_csv_empty_angle_defaults_to_zero():
    # rotation absente (None) sur un composant affecté → Angle "0" et non ""
    # (sinon ToInteger("") plante l'import machine).
    comp = _component(id=3, value="x", footprint_pnp="0603")
    rows = [(_bom_item(reference_item="R5", value_harmonized="x", footprint_pnp="0603",
                       x=1.0, y=2.0, rotation=None, placement_side="TOP"), comp)]
    out = _build_csv(rows, ["position", "angle"], ",", {3: {"slot_start": 1, "nozzle_type": 503}})
    assert out.strip().splitlines()[1] == "R5,0"


def test_build_csv_number_formatting_no_float_artifact():
    comp = _component(id=1)
    rows = [(_bom_item(reference_item="C1", value_harmonized="x", footprint_pnp="f",
                       x=0.1 + 0.2, y=7.7, rotation=180, placement_side="TOP"), comp)]
    out = _build_csv(rows, ["x", "y", "angle"], ",", {1: {"slot_start": 1, "nozzle_type": 503}})
    # 0.1+0.2 ne doit pas fuir en 0.30000000000000004.
    assert out.strip().splitlines()[1] == "0.3,7.7,180"


# ── Construction TXT (fichier centroïde de placement) ───────────────────────

def test_build_txt_centroid_format_no_header():
    """Une ligne par composant : 'Ref Valeur Empreinte X Y Angle Face', espaces,
    sans en-tête, tri naturel par désignateur (C2 < C10)."""
    rows = [
        (_bom_item(reference_item="C10", value_harmonized="100pF", footprint_pnp="0603",
                   x=147.31, y=27.92, rotation=180, placement_side="Bottom"), _component()),
        (_bom_item(reference_item="C2", value_harmonized="4.7uF/50V", footprint_pnp="1206",
                   x=157.55, y=34.93, rotation=270, placement_side="B"), _component()),
    ]
    out = _build_txt(rows)
    lines = out.strip().splitlines()
    # Pas d'en-tête ; C2 (numéro 2) avant C10 (tri naturel).
    assert lines[0] == "C2 4.7uF/50V 1206 157.55 34.93 270 B"
    assert lines[1] == "C10 100pF 0603 147.31 27.92 180 B"


def test_build_txt_angle_defaults_to_zero_and_side_letter():
    rows = [
        (_bom_item(reference_item="R5", value_harmonized="10k", footprint_pnp="0603",
                   x=1.0, y=2.0, rotation=None, placement_side="Top"), _component()),
    ]
    out = _build_txt(rows).strip()
    assert out == "R5 10k 0603 1 2 0 T"


def test_build_txt_internal_spaces_become_underscore():
    """Les espaces DANS la valeur/empreinte deviennent '_' → 7 colonnes garanties."""
    rows = [
        (_bom_item(reference_item="D1", value_harmonized="US1G-E3_5AT", footprint_pnp="SMA (DO-214AC)",
                   x=13.2, y=10.0, rotation=180, placement_side="Top"), _component()),
        (_bom_item(reference_item="LED1", value_harmonized="LTST-C190KRKT RED", footprint_pnp="0603",
                   x=44.5, y=37.3, rotation=0, placement_side="Top"), _component()),
    ]
    lines = _build_txt(rows).strip().splitlines()
    assert lines[0] == "D1 US1G-E3_5AT SMA_(DO-214AC) 13.2 10 180 T"
    assert lines[1] == "LED1 LTST-C190KRKT_RED 0603 44.5 37.3 0 T"
    # Chaque ligne a exactement 7 colonnes.
    assert all(len(line.split(" ")) == 7 for line in lines)


# ── build_pnp_export : choix de format / nom de fichier ─────────────────────

def test_build_pnp_export_txt_filename_and_media(monkeypatch):
    machine = SimpleNamespace(name="SMT 1010", export_format="CSV", export_columns=None, export_separator=None)
    production = SimpleNamespace(name="Carte A", bom_links=[])
    # Override format → TXT ; aucune ligne (bom_links vide) → contenu vide, sans en-tête.
    monkeypatch.setattr("src.services.pnp_export_service._iter_export_items", lambda db, prod, rev: [])
    filename, media_type, content = build_pnp_export(
        db=None, machine=machine, production=production, export_format="TXT",
    )
    assert filename == "SMT_1010_Carte_A_pnp.txt"
    assert media_type.startswith("text/plain")
    assert content == ""


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
