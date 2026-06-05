"""Helpers de déduction nozzle ↔ composant (fondation).

La portée réelle de chaque nozzle sur le banc de feeders sera fournie par
l'utilisateur APRÈS tests physiques (voir ``NOZZLE_REACH_BY_CLASS``, laissé
vide). Tant que la portée n'est pas renseignée, AUCUNE contrainte de portée
n'est appliquée par l'optimiseur de placement : ce module ne fait pour l'instant
que *déduire* la classe de nozzle d'un composant et l'exposer pour affichage.
"""

from typing import Dict, Optional, Tuple

# Classes de nozzle, du plus petit (1) au plus gros. Le libellé est neutre
# (S/M/L/XL) en attendant le catalogue nozzle réel (ex. 501..505).
NOZZLE_CLASS_LABELS: Dict[int, str] = {
    1: "S",
    2: "M",
    3: "L",
    4: "XL",
}


def deduce_nozzle_class(feeder_size_mm: Optional[int]) -> Optional[int]:
    """Déduit la classe de nozzle depuis la largeur de feeder (proxy de la
    taille du boîtier). Petit boîtier (≤8 mm) → petit nozzle. Seuils éditables
    quand le catalogue nozzle réel sera connu.
    """
    if feeder_size_mm is None:
        return None
    if feeder_size_mm <= 8:
        return 1
    if feeder_size_mm <= 12:
        return 2
    if feeder_size_mm <= 24:
        return 3
    return 4


def nozzle_class_label(nozzle_class: Optional[int]) -> Optional[str]:
    if nozzle_class is None:
        return None
    return NOZZLE_CLASS_LABELS.get(nozzle_class, str(nozzle_class))


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
