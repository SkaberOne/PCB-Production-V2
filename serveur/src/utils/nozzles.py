"""Helpers de déduction nozzle ↔ composant (fondation).

La portée réelle de chaque nozzle sur le banc de feeders sera fournie par
l'utilisateur APRÈS tests physiques (voir ``NOZZLE_REACH_BY_CLASS``, laissé
vide). Tant que la portée n'est pas renseignée, AUCUNE contrainte de portée
n'est appliquée par l'optimiseur de placement : ce module ne fait pour l'instant
que *déduire* la classe de nozzle d'un composant et l'exposer pour affichage.
"""

from typing import Dict, Optional

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


# ─── Portée (À RENSEIGNER après tests physiques) ────────────────────────────
# Map classe de nozzle → portée autorisée sur le banc, en nombre de slots
# autour de la position du nozzle. Vide = aucune contrainte appliquée.
# Exemple attendu plus tard : {1: 40, 2: 30, 3: 20, 4: 10}
# (un gros nozzle a une portée réduite, d'où « 505 à gauche n'atteint pas la droite »).
NOZZLE_REACH_BY_CLASS: Dict[int, int] = {}


def nozzle_reach_slots(nozzle_class: Optional[int]) -> Optional[int]:
    """Portée (en nb de slots) d'une classe de nozzle, ou None si non définie."""
    if nozzle_class is None:
        return None
    return NOZZLE_REACH_BY_CLASS.get(nozzle_class)
