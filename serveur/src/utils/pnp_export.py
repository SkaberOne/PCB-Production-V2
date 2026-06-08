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

# Numérotation physique du rail arrière (colonne « Feeder » de l'export).
#   ASC  : continue — l'arrière prolonge l'avant, gauche→droite (ex. 80 pos →
#          avant 1..40, arrière 41..80). Défaut ; correspond aux positions
#          linéaires internes.
#   DESC : inversée — l'arrière décroît de gauche à droite (ex. arrière 80..41).
DEFAULT_BACK_ORDER = "ASC"
VALID_BACK_ORDERS = ("ASC", "DESC")


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


def normalize_back_order(value: Optional[str]) -> str:
    """Retourne une numérotation arrière valide ('ASC'/'DESC'), défaut 'ASC'."""
    if not value:
        return DEFAULT_BACK_ORDER
    upper = str(value).strip().upper()
    return upper if upper in VALID_BACK_ORDERS else DEFAULT_BACK_ORDER


def physical_feeder_number(
    linear_pos: Optional[int],
    num_positions: Optional[int],
    back_order: Optional[str] = None,
) -> Optional[int]:
    """Convertit une position linéaire interne (1..num_positions) en numéro
    physique de feeder pour l'export, selon la numérotation arrière de la machine.

    Le banc = deux rampes ; l'avant occupe les positions 1..front_cols
    (front_cols = (num_positions + 1) // 2), l'arrière front_cols+1..num_positions.
    L'avant est toujours numéroté 1→front_cols (gauche→droite). L'arrière :
      - 'ASC'  : front_cols+1 .. num_positions (inchangé vs position linéaire) ;
      - 'DESC' : num_positions .. front_cols+1 (décroissant gauche→droite).

    Renvoie ``linear_pos`` tel quel si les paramètres sont invalides.
    """
    if not linear_pos:
        return linear_pos
    n = int(num_positions or 0)
    pos = int(linear_pos)
    if n <= 0 or pos < 1 or pos > n:
        return linear_pos
    front_cols = (n + 1) // 2
    if pos <= front_cols:
        return pos
    column = pos - front_cols  # 1..back_cols, gauche→droite
    if normalize_back_order(back_order) == "DESC":
        return n - column + 1
    return front_cols + column


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
