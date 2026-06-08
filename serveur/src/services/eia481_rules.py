"""Table de correspondance EIA-481 (boîtier -> pitch / largeur de bande / feeder).

Norme EIA-481 / IEC 60286-3 pour les bandes porteuses de composants CMS.
Cette table couvre les boîtiers les plus courants : elle sert de source
*première* pour pré-remplir pitch / largeur de bande / feeder, le parsing PDF
de la datasheet servant de complément (cf ADR 0003).

Les valeurs sont des approximations standard, modifiables au besoin.
Notation feeder par largeur de bande : CL8 / CL12 / CL16 / CL24.
"""

from __future__ import annotations

import re
from typing import Optional, TypedDict


class Eia481Match(TypedDict):
    """Résultat d'une recherche dans la table EIA-481."""

    package: str
    pitch_mm: Optional[float]
    tape_width_mm: Optional[float]
    feeder: Optional[str]
    tape_thickness_mm: Optional[float]
    matched: bool


# Alias de codes boîtiers fabricant -> nom JEDEC/EIA canonique (normalisés).
# Approximations documentées (ROHM, etc.) ; à corriger si besoin.
_PACKAGE_ALIASES: dict[str, str] = {
    # ROHM transistors/diodes "xMT3"
    "SMT3": "SOT23",      # SC-59
    "UMT3": "SOT323",     # SC-70 / SC-59A
    "UMT3F": "SOT323",
    "VMT3": "SOT563",
    "EMT3": "SOT723",
    "FMT3": "SOT723",
    # Désignations SC -> SOT
    "SC59": "SOT23",
    "SC59A": "SOT323",
    "SC70": "SOT323",
    "SC75": "SOT416",
    # Power packages
    "TO252": "DPAK",
    "TO263": "D2PAK",
    "TO236": "SOT23",
    "TO236AB": "SOT23",
}


# Boîtiers groupés par (pitch_mm, tape_width_mm). Les clés sont normalisées
# (majuscules, sans séparateurs ni préfixe de désignation R/C/L/D/U).
_PACKAGE_GROUPS: list[tuple[float, float, set[str]]] = [
    # pitch 2 mm, bande 8 mm — composants minuscules
    (
        2.0,
        8.0,
        {
            "01005", "0201", "0402",
            "SOT723", "SOT883", "SOT416", "SOT1123",
            "SOD962", "SOD963",
        },
    ),
    # pitch 4 mm, bande 8 mm — passifs courants + petits boîtiers actifs
    (
        4.0,
        8.0,
        {
            "0603", "0805", "1206", "1210", "1812", "2010", "2512",
            "SOT23", "SOT25", "SOT26", "SOT233", "SOT235", "SOT236",
            "SOT323", "SOT343", "SOT353", "SOT363", "SOT523", "SOT563",
            "SOD123", "SOD323", "SOD523", "SOD882", "SOD123F", "SOD323F",
            "MELF", "MINIMELF", "SC70",
        },
    ),
    # pitch 8 mm, bande 12 mm — boîtiers logiques moyens
    (
        8.0,
        12.0,
        {
            "SOT223", "SOT89",
            "SO8", "SO14", "SOIC8", "SOIC14", "MSOP8", "MSOP10",
            "TSSOP8", "TSSOP14", "TSSOP16", "TSSOP20",
            "DFN", "QFN16", "QFN20", "VSSOP8",
        },
    ),
    # pitch 12 mm, bande 16 mm — QFP/QFN/SOIC larges + DPAK
    (
        12.0,
        16.0,
        {
            "SO16", "SO20", "SOIC16", "SOIC20", "SOIC28",
            "QFP32", "QFP44", "QFN32", "QFN48", "LQFP32", "LQFP44", "LQFP48",
            "TQFP32", "TQFP44", "TQFP48", "DPAK", "TSSOP24", "TSSOP28",
        },
    ),
    # pitch 16 mm, bande 24 mm — gros ICs / connecteurs / D2PAK
    (
        16.0,
        24.0,
        {
            "SO24", "SO28", "QFP64", "QFP100", "QFP128", "QFP144",
            "LQFP64", "LQFP100", "LQFP128", "LQFP144",
            "TQFP64", "TQFP100", "TQFP128", "BGA", "D2PAK",
        },
    ),
]


def _normalize_package(package: str) -> str:
    """Normalise un nom de boîtier pour la recherche dans la table.

    Met en majuscules, retire les séparateurs (-, _, espaces), résout un
    éventuel préfixe de désignation à une lettre (R0805 -> 0805) et applique
    les alias fabricant connus (SMT3 -> SOT23, ...).
    """
    if not package:
        return ""
    cleaned = re.sub(r"[\s\-_]", "", str(package).upper())
    # Retire un préfixe de lettre devant un boîtier purement numérique
    # (ex. R0805, C0603, L1206) sans toucher SOT23/SOIC8/QFN...
    match = re.match(r"^[A-Z](\d{3,5})$", cleaned)
    if match:
        cleaned = match.group(1)
    return _PACKAGE_ALIASES.get(cleaned, cleaned)


def feeder_for_tape_width(tape_width_mm: Optional[float]) -> Optional[str]:
    """Retourne la notation feeder (CL8/CL12/CL16/CL24) pour une largeur de bande."""
    if tape_width_mm is None or tape_width_mm <= 0:
        return None
    return f"CL{int(round(tape_width_mm))}"


def default_tape_thickness_mm(tape_width_mm: Optional[float]) -> float:
    """Épaisseur de bande par défaut selon la largeur (cohérent avec le frontend).

    EIA-481 ne normalise pas l'épaisseur par largeur (elle dépend du composant
    et du matériau : papier <= 1,1 mm pour passifs fins, gaufré <= 1,6 mm).
    Ces valeurs sont des défauts réalistes par largeur, modifiables par bobine.
    """
    if tape_width_mm is None or tape_width_mm <= 0:
        return 1.0
    if tape_width_mm <= 8:
        return 0.7  # bande papier — passifs 0402/0603/0805/1206
    if tape_width_mm <= 12:
        return 1.0
    if tape_width_mm <= 16:
        return 1.2
    return 1.6  # bandes gaufrées larges (24 mm et +)


def lookup_package(package: str) -> Eia481Match:
    """Recherche un boîtier dans la table EIA-481.

    Renvoie toujours un dict ; `matched=False` si le boîtier est inconnu
    (tous les champs dérivés sont alors None).
    """
    normalized = _normalize_package(package)
    for pitch_mm, tape_width_mm, packages in _PACKAGE_GROUPS:
        if normalized in packages:
            return Eia481Match(
                package=normalized,
                pitch_mm=pitch_mm,
                tape_width_mm=tape_width_mm,
                feeder=feeder_for_tape_width(tape_width_mm),
                tape_thickness_mm=default_tape_thickness_mm(tape_width_mm),
                matched=True,
            )
    return Eia481Match(
        package=normalized,
        pitch_mm=None,
        tape_width_mm=None,
        feeder=None,
        tape_thickness_mm=None,
        matched=False,
    )
