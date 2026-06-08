"""Référentiel des colonnes d'export PnP (fichier envoyé au logiciel Pick&Place).

Source de vérité partagée par le service d'export et la validation des schémas.
Les identifiants de colonnes correspondent au menu de mapping du logiciel SMT1010
(Position, Component Name, Footprint, X, Y, Angle, Top/Bottom, Feeder, Nozzle, Group).
"""

from typing import List, Optional

# Registre ordonné : id interne -> en-tête de colonne fichier + obligation.
PNP_EXPORT_COLUMNS = [
    {"id": "position", "header": "Position", "required": True},
    {"id": "name", "header": "Component Name", "required": True},
    {"id": "footprint", "header": "Footprint", "required": True},
    {"id": "x", "header": "X", "required": True},
    {"id": "y", "header": "Y", "required": True},
    {"id": "angle", "header": "Angle", "required": False},
    {"id": "side", "header": "Top/Bottom", "required": False},
    {"id": "feeder", "header": "Feeder", "required": False},
    {"id": "nozzle", "header": "Nozzle", "required": False},
    {"id": "group", "header": "Group", "required": False},
    {"id": "quantity", "header": "Quantity", "required": False},
    {"id": "comment", "header": "Comment", "required": False},
]

COLUMN_HEADERS = {col["id"]: col["header"] for col in PNP_EXPORT_COLUMNS}
VALID_COLUMN_IDS = [col["id"] for col in PNP_EXPORT_COLUMNS]
REQUIRED_COLUMN_IDS = [col["id"] for col in PNP_EXPORT_COLUMNS if col["required"]]
DEFAULT_COLUMN_IDS = [
    "position", "name", "footprint", "x", "y",
    "angle", "side", "feeder", "nozzle", "group",
]

DEFAULT_FORMAT = "CSV"
VALID_FORMATS = ("CSV", "TXT")
DEFAULT_SEPARATOR = ","
VALID_SEPARATORS = (",", ";")


def normalize_format(value: Optional[str]) -> str:
    """Retourne un format valide ('CSV'/'TXT'), défaut 'CSV'."""
    if not value:
        return DEFAULT_FORMAT
    upper = str(value).strip().upper()
    return upper if upper in VALID_FORMATS else DEFAULT_FORMAT


def normalize_separator(value: Optional[str]) -> str:
    """Retourne un séparateur valide (',' ou ';'), défaut ','."""
    if not value:
        return DEFAULT_SEPARATOR
    candidate = str(value).strip()
    return candidate if candidate in VALID_SEPARATORS else DEFAULT_SEPARATOR


def normalize_columns(columns: Optional[List[str]]) -> List[str]:
    """Nettoie une liste d'ids de colonnes : ne garde que les ids connus, dédoublonne
    en conservant l'ordre, et garantit la présence des colonnes obligatoires (insérées
    dans leur ordre canonique en tête si absentes). Liste vide/None → défaut.
    """
    if not columns:
        return list(DEFAULT_COLUMN_IDS)

    seen = set()
    ordered: List[str] = []
    for raw in columns:
        col_id = str(raw).strip()
        if col_id in VALID_COLUMN_IDS and col_id not in seen:
            seen.add(col_id)
            ordered.append(col_id)

    if not ordered:
        return list(DEFAULT_COLUMN_IDS)

    missing_required = [col_id for col_id in REQUIRED_COLUMN_IDS if col_id not in seen]
    return missing_required + ordered
