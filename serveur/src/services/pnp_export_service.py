"""Génération du fichier d'export PnP envoyé au logiciel Pick&Place (ex. SMT1010).

Deux formats :
  - CSV : un fichier de coordonnées, une ligne par composant posé, colonnes choisies
    par la machine (Position, Component Name, Footprint, X, Y, Angle, Top/Bottom,
    Feeder, Nozzle, Group). Le slot feeder et la nozzle proviennent de l'implantation
    calculée (get_machine_production_feeder_plan).
  - TXT : la BOM agrégée avec empreintes harmonisées (Référence(s), Valeur, Empreinte,
    Qté), séparée par tabulation.

Le fichier reprend la production affectée à la machine ; il peut être filtré sur une
face (bom_revision_id).
"""

import csv
import io
import re
import unicodedata
from typing import Dict, List, Optional, Tuple

from sqlalchemy.orm import Session, joinedload

from ..models.bom import BomItem, Component
from ..models.machines import PnpMachine
from .assignment_helpers import sort_production_bom_links
from .component_library_service import ComponentLibraryService
from ..utils.pnp_export import (
    COLUMN_HEADERS,
    normalize_back_order,
    normalize_columns,
    normalize_format,
    normalize_separator,
    physical_feeder_number,
)


def _slugify(value: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9_-]+", "_", (value or "").strip())
    return cleaned.strip("_") or "export"


def _face_suffix(production, bom_revision_id: Optional[int]) -> str:
    """Suffixe '_top' / '_bot' du nom de fichier quand une face est sélectionnée."""
    if not bom_revision_id:
        return ""
    for link in list(getattr(production, "bom_links", []) or []):
        revision = getattr(link, "revision", None)
        if revision and revision.id == bom_revision_id:
            raw = revision.type.value if hasattr(revision.type, "value") else revision.type
            side = str(raw or "").strip().lower()
            if side:
                return f"_{side}"
            break
    return ""


def _normalize_side(raw: Optional[str]) -> str:
    """Normalise la face vers le vocabulaire machine : 'Top' / 'Bottom'."""
    if not raw:
        return ""
    head = str(raw).strip().upper()[:1]
    if head == "T":
        return "Top"
    if head == "B":
        return "Bottom"
    return str(raw).strip()


# Le logiciel PnP ne reconnaît que l'ASCII. On translittère donc TOUT caractère
# spécial vers un équivalent ASCII. Conventions valeurs composants (Eric) :
# kohm -> K, ohm -> R, Mohm -> M, micro -> u (uF). nF/pF restent (déjà ASCII).
# Les clés sont écrites en séquences d'échappement Unicode (\u....) pour éviter
# toute ambiguïté de glyphe (deux code points "ohm" existent : U+2126 et U+03A9).
# Les combinaisons "k+ohm" / "M+ohm" précèdent la règle "ohm seul" pour gagner.
# Les lettres accentuées (é->e, ç->c…) sont gérées ensuite par NFKD ; ce qui n'a
# aucun équivalent est supprimé.
_EXPLICIT_REPLACEMENTS = {
    "µ": "u",        # micro sign
    "μ": "u",        # greek small mu
    "ν": "n",        # greek small nu
    "kΩ": "K",       # k + ohm sign -> kilo-ohm = K
    "KΩ": "K",
    "kΩ": "K",       # k + omega -> kilo-ohm = K
    "KΩ": "K",
    "MΩ": "M",       # mega-ohm (ohm sign)
    "MΩ": "M",       # mega-ohm (omega)
    "Ω": "R",        # ohm sign seul -> R
    "Ω": "R",        # omega seul -> R
    "°": "deg",      # degree
    "±": "+/-",      # plus-minus
    "×": "x",        # multiplication
    "÷": "/",        # division
    "–": "-",        # en dash
    "—": "-",        # em dash
    "‘": "'",        # left single quote
    "’": "'",        # right single quote
    "“": '"',        # left double quote
    "”": '"',        # right double quote
    "…": "...",      # ellipsis
    "²": "2",        # superscript two
    "³": "3",        # superscript three
    "€": "EUR",      # euro
    "·": ".",        # middle dot
    "′": "'",        # prime
    "″": '"',        # double prime
}


def _sanitize(value):
    """Rend une valeur sûre pour l'export : tout en ASCII, caractères spéciaux
    remplacés par leur équivalent ou supprimés."""
    if value is None or value == "":
        return value
    text = str(value)
    # Remplacements prioritaires en points de code EXPLICITES (sans ambiguite de
    # glyphe : deux code points "ohm" existent, U+2126 et U+03A9). kilo/mega-ohm
    # AVANT ohm seul. micro (U+00B5) et mu (U+03BC) -> u ; nu (U+03BD) -> n.
    for special, replacement in (
        ("kΩ", "K"), ("KΩ", "K"), ("kΩ", "K"), ("KΩ", "K"),
        ("MΩ", "M"), ("MΩ", "M"),
        ("Ω", "R"), ("Ω", "R"),
        ("µ", "u"), ("μ", "u"), ("ν", "n"),
    ):
        if special in text:
            text = text.replace(special, replacement)
    for special, replacement in _EXPLICIT_REPLACEMENTS.items():
        if special in text:
            text = text.replace(special, replacement)
    # Lettres accentuées → base ASCII (é→e, à→a, ö→o…), puis on retire le reste.
    text = unicodedata.normalize("NFKD", text)
    return text.encode("ascii", "ignore").decode("ascii")


def _fmt_number(value) -> str:
    if value is None:
        return ""
    if isinstance(value, float):
        # Coordonnées : on évite les artefacts flottants tout en gardant la précision utile.
        return f"{value:.4f}".rstrip("0").rstrip(".")
    return str(value)


def _column_value(
    col_id: str,
    bom_item: BomItem,
    component: Optional[Component],
    assignment: Optional[Dict],
    num_positions: int = 0,
    back_order: str = "ASC",
) -> str:
    if col_id == "position":
        return bom_item.reference_item or ""
    if col_id == "name":
        return bom_item.value_harmonized or bom_item.value_raw or (component.value if component else "") or ""
    if col_id == "footprint":
        return (
            bom_item.footprint_pnp
            or (component.footprint_pnp if component else None)
            or (component.package if component else None)
            or ""
        )
    if col_id == "x":
        return _fmt_number(bom_item.x)
    if col_id == "y":
        return _fmt_number(bom_item.y)
    if col_id == "angle":
        return _fmt_number(bom_item.rotation)
    if col_id == "side":
        return _normalize_side(bom_item.placement_side)
    if col_id == "feeder":
        slot_start = assignment.get("slot_start") if assignment else None
        if not slot_start:
            return ""
        return str(physical_feeder_number(slot_start, num_positions, back_order))
    if col_id == "nozzle":
        return str(assignment["nozzle_type"]) if assignment and assignment.get("nozzle_type") else ""
    if col_id == "group":
        return (component.component_type if component and component.component_type else "") or ""
    if col_id == "quantity":
        return str(max(int(bom_item.quantity or 1), 1))
    if col_id == "comment":
        return bom_item.notes or ""
    return ""


def _iter_export_items(
    db: Session,
    production,
    bom_revision_id: Optional[int],
) -> List[Tuple[BomItem, Optional[Component]]]:
    """Retourne la liste (bom_item, composant matché) des faces concernées, hors DNP."""
    components = (
        db.query(Component)
        .options(joinedload(Component.fixed_cart))
        .order_by(Component.id.asc())
        .all()
    )
    lookup = ComponentLibraryService.build_lookup(components)

    rows: List[Tuple[BomItem, Optional[Component]]] = []
    for link in sort_production_bom_links(production.bom_links):
        revision = link.revision
        if not revision:
            continue
        if bom_revision_id is not None and revision.id != bom_revision_id:
            continue
        side = revision.type.value if hasattr(revision.type, "value") else revision.type
        for bom_item in list(revision.items or []):
            if bom_item.dnp:
                continue
            if not bom_item.placement_side and side:
                bom_item.placement_side = side
            component = ComponentLibraryService.match_bom_item(lookup, bom_item)
            rows.append((bom_item, component))
    return rows


def _build_csv(
    rows,
    column_ids: List[str],
    separator: str,
    assignment_by_component: Dict[int, Dict],
    num_positions: int = 0,
    back_order: str = "ASC",
) -> str:
    output = io.StringIO()
    writer = csv.writer(output, delimiter=separator, lineterminator="\n")
    writer.writerow([COLUMN_HEADERS[c] for c in column_ids])
    for bom_item, component in rows:
        assignment = assignment_by_component.get(component.id) if component else None
        writer.writerow([
            _sanitize(_column_value(c, bom_item, component, assignment, num_positions, back_order))
            for c in column_ids
        ])
    return output.getvalue()


def _build_txt(rows) -> str:
    """BOM agrégée par (valeur, empreinte harmonisée) : Référence(s), Valeur, Empreinte, Qté."""
    groups: Dict[Tuple[str, str], Dict] = {}
    for bom_item, component in rows:
        name = bom_item.value_harmonized or bom_item.value_raw or (component.value if component else "") or ""
        footprint = (
            bom_item.footprint_pnp
            or (component.footprint_pnp if component else None)
            or (component.package if component else None)
            or ""
        )
        key = (name, footprint)
        bucket = groups.setdefault(key, {"refs": [], "qty": 0})
        if bom_item.reference_item:
            bucket["refs"].append(bom_item.reference_item)
        bucket["qty"] += max(int(bom_item.quantity or 1), 1)

    lines = ["Reference\tValeur\tEmpreinte harmonisee\tQte"]
    for (name, footprint), bucket in sorted(groups.items(), key=lambda kv: (kv[0][0], kv[0][1])):
        refs = " ".join(sorted(bucket["refs"]))
        lines.append(f"{_sanitize(refs)}\t{_sanitize(name)}\t{_sanitize(footprint)}\t{bucket['qty']}")
    return "\n".join(lines) + "\n"


def build_pnp_export(
    db: Session,
    machine: PnpMachine,
    production,
    bom_revision_id: Optional[int] = None,
    export_format: Optional[str] = None,
    export_columns: Optional[List[str]] = None,
    export_separator: Optional[str] = None,
    assignment_by_component: Optional[Dict[int, Dict]] = None,
) -> Tuple[str, str, str]:
    """Construit le fichier d'export.

    Les paramètres d'override (format/colonnes/séparateur) priment sur la config
    stockée de la machine ; sinon on retombe sur celle-ci, puis sur les défauts.

    Retourne (filename, media_type, content).
    """
    fmt = normalize_format(export_format if export_format is not None else machine.export_format)
    rows = _iter_export_items(db, production, bom_revision_id)

    base_name = f"{_slugify(machine.name)}_{_slugify(production.name)}_pnp{_face_suffix(production, bom_revision_id)}"

    if fmt == "TXT":
        content = _build_txt(rows)
        return f"{base_name}.txt", "text/plain; charset=utf-8", content

    # CSV
    import json

    stored_columns = None
    if export_columns is not None:
        stored_columns = export_columns
    elif machine.export_columns:
        try:
            parsed = json.loads(machine.export_columns)
            stored_columns = parsed if isinstance(parsed, list) else None
        except (TypeError, ValueError):
            stored_columns = None
    column_ids = normalize_columns(stored_columns)
    separator = normalize_separator(export_separator if export_separator is not None else machine.export_separator)
    num_positions = int(getattr(machine, "num_positions", 0) or 0)
    back_order = normalize_back_order(getattr(machine, "feeder_back_order", None))
    content = _build_csv(
        rows, column_ids, separator, assignment_by_component or {}, num_positions, back_order,
    )
    return f"{base_name}.csv", "text/csv; charset=utf-8", content
