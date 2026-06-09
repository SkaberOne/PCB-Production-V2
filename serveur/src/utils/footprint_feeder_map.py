"""Déduction d'une largeur de bande feeder (mm) à partir du footprint/boîtier.

Source de vérité unique pour compléter ``Component.feeder_type`` quand il est vide.
Réutilisé par :
  - le script de backfill ``serveur/backfill_feeder_types.py`` (dev.db) ;
  - la migration Alembic de backfill (prod).

Les largeurs suivent la table de référence interne ``MACHINE_FOOTPRINT_RULES`` (ex.
SMC=16, SOIC-16=12, QFN=12, TQFP-100=16, D2PAK=16, POWERPAK1212=16) complétée par le
standard EIA-481 pour les boîtiers absents du catalogue (DO-214xx, Panasonic C/D/E,
quelques inductances identifiées par MPN, etc.).

Conception volontaire : seules les familles à correspondance fiable sont mappées.
Les connecteurs, le traversant (TO-220, DIP) et les références non identifiables
renvoient ``None`` afin de rester en saisie manuelle (on ne devine pas).

Important : ce module ne touche jamais ``Component.value`` (clé de matching BOM↔composant).
"""

import re
from typing import List, Optional, Tuple

from .feeder_types import feeder_type_from_size_mm


# Règles ordonnées : (regex compilée, largeur_mm, libellé d'origine).
# La première règle qui matche l'un des champs (footprint_pnp, puis footprint_eagle,
# puis package) gagne. Patterns écrits pour éviter les faux positifs (ancrages, tirets
# optionnels). Largeur exacte = label CL* + affichage ; le placement n'en retient que
# le binaire <=8 mm (1 position) vs >8 mm (2 positions).
_RAW_RULES: List[Tuple[str, int, str]] = [
    # --- Inductances identifiées par MPN (absentes du catalogue, tailles vérifiées datasheet) ---
    (r"SRN3015", 8, "Bourns SRN3015 3x3mm"),
    (r"IHLP-?2020|IND_IHLP-?2020", 12, "Vishay IHLP-2020 5.2x5.5mm"),
    (r"NPIS64D", 12, "NPIS64D 6.5x6mm"),
    (r"VCHA075D", 12, "Cyntec VCHA075D ~7.5mm"),
    (r"SPM10054", 16, "TDK SPM10054 10.7x10mm"),
    (r"SRU1208", 16, "Bourns SRU1208 ~12.5mm"),
    (r"INDPM10|744066", 16, "inductance ~10x10mm"),

    # --- Diodes boîtiers DO-214 (ordre : AB avant A[AC]) ---
    (r"DO-?214AB", 16, "DO-214AB (SMC) 16mm"),
    (r"DO-?214A[AC]", 12, "DO-214AA/AC (SMB/SMA) 12mm"),

    # --- Diodes SM* (SMC avant SMA/SMB pour ne pas capter SMC par SM) ---
    (r"\bSMC(_|\b)", 16, "SMC 16mm"),
    (r"\bSM[AB](_|\b)", 12, "SMA/SMB 12mm"),

    # --- Condensateurs électrolytiques / tantale Panasonic (E avant pour 16mm) ---
    (r"PANASONIC_E", 16, "Panasonic E (~10mm) 16mm"),
    (r"PANASONIC_[CD]", 12, "Panasonic C/D 12mm"),

    # --- Power packages ---
    (r"POWERPAK.?1212", 16, "PowerPAK 1212 16mm"),
    (r"POWERPAK.?SO-?8|POWERPAKSO-?8|\bSO-?8 ?POWER", 12, "PowerPAK SO-8 12mm"),
    (r"\bSOT-?669\b", 12, "SOT-669 (LFPAK) 12mm"),
    (r"\bTO-?277\b", 12, "TO-277 (SMPC) 12mm"),

    # --- Power traversant en bande (D2PAK/DPAK) ---
    (r"TO-?263", 16, "TO-263 (D2PAK) 16mm"),
    (r"\bDPAK\b|TO-?252", 16, "TO-252 (DPAK) 16mm"),

    # --- Boîtiers IC à grand nombre de broches ---
    (r"\bSOP-?64\b", 24, "SOP-64 (large) 24mm"),
    (r"TQFP-?144|LQFP-?144", 24, "QFP-144 24mm"),
    (r"TQFP-?(64|100)|LQFP-?(64|100)|\bTQ100\b", 16, "QFP-64/100 16mm"),
    (r"TQFP-?(32|48)|LQFP-?(32|48)", 12, "QFP-32/48 12mm"),
    (r"\bSOT-?65-?28\b", 12, "SSOP-28 (0.65) 12mm"),
    (r"QSOP-?16|QSOP-?24", 12, "QSOP 12mm"),
    (r"\bMSOP-?(8|10)\b|\bMSOP\b", 12, "MSOP 12mm"),
    (r"TSSOP", 12, "TSSOP 12mm"),
    (r"\bSSOP\b", 12, "SSOP 12mm"),
    (r"SOIC-?(4|8|14|16)\b|\bSOIC\b", 12, "SOIC 12mm"),
    (r"\bSOT-?223\b|\bSOT-?89\b", 12, "SOT-223/89 12mm"),
    (r"\bQFN\b", 12, "QFN 12mm"),

    # --- Petits SOT / SC / DFN (8mm) ---
    (r"\bSOT-?65-?6\b", 8, "SOT-65-6 8mm"),
    (r"\bSOT-?23(-3|-5|-6|-8)?\b|TSOT-?23", 8, "SOT-23 8mm"),
    (r"\bSOT-?323\b|SOT323", 8, "SOT-323 8mm"),
    (r"\bSOT-?363\b|SOT363|\bSOT-?353\b", 8, "SOT-363/353 8mm"),
    (r"\bSC-?59\b|SC59|\bSC-?70\b|SC70", 8, "SC-59/70 8mm"),
    (r"DFN2020", 8, "DFN2020 (2x2) 8mm"),
    (r"\bT?DFN-?(6|8|10|12)\b", 8, "DFN/TDFN ≤12 8mm"),

    # --- Chips passifs / inductances code-taille petites (8mm) ---
    (r"\bM?3216\b|\b2616\b|\b0806\b|\b0803\b|\b0508\b", 8, "chip/inductance code-taille 8mm"),
    (r"\b0201\b|\b0402\b|\b0603\b|\b0805\b|\b1206\b", 8, "chip ≤1206 8mm"),

    # 0508 = sense R large ~5x2mm : placé à 12mm (légèrement incertain) — voir ci-dessous override
]

_COMPILED_RULES: List[Tuple[re.Pattern, int, str]] = [
    (re.compile(pat), width, label) for pat, width, label in _RAW_RULES
]

# 0508 traité comme 12mm (résistance de mesure large ~5x2mm). Override explicite après
# la règle 8mm générique ci-dessus n'est pas possible (premier match gagne), donc on le
# retire de la règle 8mm : géré ici en pré-passe.
_OVERRIDE_RULES: List[Tuple[re.Pattern, int, str]] = [
    (re.compile(r"\b0508\b"), 12, "0508 sense R large ~5x2mm 12mm"),
]


def _candidate_tokens(*fields: Optional[str]) -> List[str]:
    """Champs non vides, normalisés en MAJUSCULES, espaces compactés."""
    tokens = []
    for field in fields:
        text = (field or "").strip().upper()
        if text:
            tokens.append(re.sub(r"\s+", " ", text))
    return tokens


def deduce_feeder_size_mm(
    footprint_pnp: Optional[str],
    footprint_eagle: Optional[str] = None,
    package: Optional[str] = None,
) -> Optional[int]:
    """Largeur de bande (mm) déduite du footprint, ou None si non identifiable."""
    tokens = _candidate_tokens(footprint_pnp, footprint_eagle, package)
    # Pré-passe : overrides explicites (priment sur les règles génériques).
    for token in tokens:
        for pattern, width, _ in _OVERRIDE_RULES:
            if pattern.search(token):
                return width
    for token in tokens:
        for pattern, width, _ in _COMPILED_RULES:
            if pattern.search(token):
                return width
    return None


def deduce_feeder_type_from_footprint(
    footprint_pnp: Optional[str],
    footprint_eagle: Optional[str] = None,
    package: Optional[str] = None,
) -> Optional[str]:
    """Label CL* déduit du footprint (ex. 'CL8-4', 'CL12'), ou None si non identifiable."""
    size_mm = deduce_feeder_size_mm(footprint_pnp, footprint_eagle, package)
    return feeder_type_from_size_mm(size_mm) if size_mm is not None else None
