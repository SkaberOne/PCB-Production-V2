"""Normalisation du statut de cycle de vie des composants (ADR 0014).

Chaque fournisseur nomme différemment le statut (Active, NRND, Last Time Buy,
End of Life, Obsolete...). On ramène tout à un petit enum interne, et on agrège
plusieurs statuts en **pire-cas** (EOL > NRND > ACTIVE).
"""

from __future__ import annotations

from typing import Iterable, Optional

# Enum interne (stocké tel quel dans COMPONENTS.lifecycle_status).
ACTIVE = "ACTIVE"
NRND = "NRND"
EOL = "EOL"
UNKNOWN = "UNKNOWN"

# Gravité pour l'agrégation pire-cas. UNKNOWN ne prime jamais sur une valeur connue.
_SEVERITY = {UNKNOWN: -1, ACTIVE: 0, NRND: 1, EOL: 2}

# Mots-clés (minuscules, séparateurs aplatis en espaces) → enum. On teste EOL en
# premier (le plus grave). Couvre les variantes Mouser/Digi-Key/Farnell/RS.
_EOL_KEYS = ("obsolete", "end of life", "eol", "discontinued", "not manufactured", "inactive")
_NRND_KEYS = ("not recommended", "nrnd", "not for new", "new design", "last time buy", "ltb")
_ACTIVE_KEYS = ("active", "in production", "production", "new product", "new at mouser", "preliminary")


def normalize_lifecycle(raw: Optional[str]) -> str:
    """Ramène un libellé fournisseur brut à l'enum interne.

    Aplati les séparateurs (``_``/``-``) pour couvrir les variantes type
    ``NOT_RECOMMENDED_FOR_NEW_DESIGN``. Retourne ``UNKNOWN`` si vide/non reconnu.
    """
    if not raw:
        return UNKNOWN
    text = str(raw).strip().lower().replace("_", " ").replace("-", " ")
    text = " ".join(text.split())  # collapse whitespace
    if not text:
        return UNKNOWN
    if any(k in text for k in _EOL_KEYS):
        return EOL
    if any(k in text for k in _NRND_KEYS):
        return NRND
    if any(k in text for k in _ACTIVE_KEYS):
        return ACTIVE
    return UNKNOWN


def worst_case(statuses: Iterable[Optional[str]]) -> str:
    """Agrège plusieurs statuts (déjà normalisés) en gardant le plus grave.

    Ignore les ``None`` / valeurs inconnues sauf s'il n'y a que ça (→ UNKNOWN).
    """
    best = UNKNOWN
    best_sev = _SEVERITY[UNKNOWN]
    for status in statuses:
        normalized = status if status in _SEVERITY else UNKNOWN
        sev = _SEVERITY[normalized]
        if sev > best_sev:
            best, best_sev = normalized, sev
    return best
