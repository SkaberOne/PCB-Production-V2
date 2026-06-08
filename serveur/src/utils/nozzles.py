"""Helpers nozzles : déduction du type de nozzle par boîtier, config par
machine (type par position), pré-remplissage par défaut, et validation de la
portée (positions à signaler en rouge).

Nomenclature Eric : types 501..505 (du plus petit boîtier au plus gros). En
pratique seuls 503/504/505 sont utilisés → pré-remplissage par défaut sur ces
trois types.
"""

from typing import Dict, List, Optional, Set, Tuple

# Types de nozzles, du plus petit boîtier (501) au plus gros (505).
NOZZLE_TYPES: Tuple[int, ...] = (501, 502, 503, 504, 505)

# Types réellement utilisés (Eric) → base du pré-remplissage par défaut.
DEFAULT_LAYOUT_TYPES: Tuple[int, ...] = (503, 504, 505)

# Mapping boîtier/footprint → type de nozzle (Eric 2026-06). Vérifié du plus gros
# au plus petit ; première correspondance gagne. Tokens normalisés (alphanum, MAJ).
_NOZZLE_TYPE_TOKENS: Tuple[Tuple[int, Tuple[str, ...]], ...] = (
    (505, ("QFP", "TQFP", "LQFP", "QFN", "BGA", "PLCC", "CONN", "DSUB", "SOICW", "SOPW", "SSOPW")),
    (504, ("SOIC", "SOP", "TSSOP", "SOT89", "SOT223", "TANT", "ELECTRO", "ELEC")),
    (503, ("0805", "1206", "1210", "SOT23", "SOT323", "MELF", "SOD")),
    (502, ("0402", "0603")),
    (501, ("01005", "0201")),
)


def _normalize_footprint(value: Optional[str]) -> str:
    return "".join(ch for ch in (value or "").upper() if ch.isalnum())


def deduce_nozzle_type(footprint: Optional[str], feeder_size_mm: Optional[int] = None) -> Optional[int]:
    """Déduit le type de nozzle (501..505) depuis le boîtier/footprint, avec
    repli sur la largeur de feeder si le footprint est inconnu."""
    norm = _normalize_footprint(footprint)
    if norm:
        for nozzle_type, tokens in _NOZZLE_TYPE_TOKENS:
            if any(token in norm for token in tokens):
                return nozzle_type
    if feeder_size_mm is not None:
        if feeder_size_mm <= 8:
            return 502
        if feeder_size_mm <= 12:
            return 504
        return 505
    return None


def default_nozzle_layout(num_nozzles: Optional[int]) -> List[int]:
    """Pré-remplissage par défaut : nozzles rangés du plus PETIT au plus GRAND,
    de gauche à droite, en blocs croissants des types réellement utilisés
    (503/504/505). Le reste de la division va aux plus gros types.

    Ex. 10 positions → 503,503,503,504,504,504,505,505,505,505.
    """
    n = int(num_nozzles or 0)
    if n <= 0:
        return []
    types = DEFAULT_LAYOUT_TYPES
    base, remainder = divmod(n, len(types))
    counts = [base] * len(types)
    # Les positions restantes sont attribuées aux plus gros types (fin du banc).
    for offset in range(remainder):
        counts[len(types) - 1 - offset] += 1
    layout: List[int] = []
    for nozzle_type, count in zip(types, counts):
        layout.extend([nozzle_type] * count)
    return layout


def normalize_nozzle_layout(layout: Optional[List], num_nozzles: Optional[int]) -> List[int]:
    """Cale un layout sur num_nozzles : tronque si trop long, complète par le
    défaut si trop court, ignore les types inconnus (remplacés par le défaut)."""
    n = int(num_nozzles or 0)
    if n <= 0:
        return []
    fallback = default_nozzle_layout(n)
    result: List[int] = []
    for index in range(n):
        value = None
        if layout and index < len(layout):
            try:
                candidate = int(layout[index])
                if candidate in NOZZLE_TYPES:
                    value = candidate
            except (TypeError, ValueError):
                value = None
        result.append(value if value is not None else fallback[index])
    return result


# ─── Portée des nozzles (données physiques observées) ───────────────────────
# La portée dépend de la POSITION du nozzle sur la tête (indice 1..N de gauche à
# droite), PAS de sa taille. La tête se déplace latéralement ; seules les
# extrémités du banc sont bridées par la course mécanique (le nozzle ne peut pas
# déborder au-delà de la course pour atteindre la colonne la plus extrême).
#
# Observations physiques (Eric, 2026-06) :
#   PnP 1 (8 nozzles)  : colonne tout à GAUCHE atteinte par nozzles 1..4
#                        colonne tout à DROITE atteinte par nozzles 5..8
#   PnP 2 (10 nozzles) : colonne tout à GAUCHE atteinte par nozzles 1..5
#                        colonne tout à DROITE atteinte par nozzles 6..10
#   → motif : limite gauche L = N//2 ; limite droite R = N//2 + 1.
#
# Modèle (course de tête, en colonnes par rampe c = 1..C) :
#   d_min = 1 - L ; d_max = C - R
#   nozzle i atteint la colonne c  ⟺  i + d_min ≤ c ≤ i + d_max
# Les limites L/R sont dérivées de N par défaut, mais surchargeables par machine
# si un PnP s'écarte du motif observé.


def nozzle_reach_left_limit(num_nozzles: int) -> int:
    """Indice du plus GRAND nozzle atteignant la colonne tout à gauche."""
    return max(1, int(num_nozzles or 0) // 2)


def nozzle_reach_right_limit(num_nozzles: int) -> int:
    """Indice du plus PETIT nozzle atteignant la colonne tout à droite."""
    return int(num_nozzles or 0) // 2 + 1


def nozzle_reach_columns(
    nozzle_index: int,
    num_nozzles: int,
    columns_per_ramp: int,
    left_limit: Optional[int] = None,
    right_limit: Optional[int] = None,
) -> Optional[Tuple[int, int]]:
    """Plage de colonnes (1..C) atteinte par le nozzle ``nozzle_index``.

    Retourne ``(lo, hi)`` (bornes incluses) ou ``None`` si les paramètres sont
    invalides ou la plage vide.
    """
    n = int(num_nozzles or 0)
    c = int(columns_per_ramp or 0)
    i = int(nozzle_index or 0)
    if n <= 0 or c <= 0 or i < 1 or i > n:
        return None
    left = nozzle_reach_left_limit(n) if left_limit is None else int(left_limit)
    right = nozzle_reach_right_limit(n) if right_limit is None else int(right_limit)
    lo = max(1, i + (1 - left))
    hi = min(c, i + (c - right))
    if hi < lo:
        return None
    return (lo, hi)


def nozzle_layout_red_positions(
    layout: List[int],
    needed_columns_by_type: Dict[int, Set[int]],
    num_nozzles: int,
    columns_per_ramp: int,
    left_limit: Optional[int] = None,
    right_limit: Optional[int] = None,
) -> List[int]:
    """Positions (1-indexées) à signaler en ROUGE.

    Un nozzle de type T est rouge si au moins une colonne où un composant de
    type T est placé n'est atteinte par AUCUN nozzle de type T du layout
    (couverture insuffisante du type). Si un type est requis mais absent du
    layout, ses colonnes restent non couvertes mais aucune position ne porte ce
    type → rien à colorer (cas « type manquant », à signaler ailleurs).
    """
    n = int(num_nozzles or 0)
    if n <= 0:
        return []
    reach_by_position = {
        position: nozzle_reach_columns(position, n, columns_per_ramp, left_limit, right_limit)
        for position in range(1, n + 1)
    }
    positions_by_type: Dict[int, List[int]] = {}
    for index, nozzle_type in enumerate(list(layout)[:n], start=1):
        positions_by_type.setdefault(int(nozzle_type), []).append(index)

    red: Set[int] = set()
    for nozzle_type, needed_columns in needed_columns_by_type.items():
        type_positions = positions_by_type.get(int(nozzle_type), [])
        covered: Set[int] = set()
        for position in type_positions:
            span = reach_by_position.get(position)
            if span:
                covered.update(range(span[0], span[1] + 1))
        if set(needed_columns) - covered:
            red.update(type_positions)
    return sorted(red)
