"""Détection du type de fichiers CAO par extension (prompt 003 / échange E02).

Eagle (``.brd`` + ``.sch``) est implémenté ; KiCad (``.kicad_pcb`` + ``.kicad_sch``)
est **reconnu** mais le parseur est **reporté** (message « à venir »). Apparie le
fichier carte et le schéma d'un dossier / lot de fichiers.
"""

import os
from typing import Dict, List, Optional

EAGLE_BOARD = ".brd"
EAGLE_SCH = ".sch"
KICAD_BOARD = ".kicad_pcb"
KICAD_SCH = ".kicad_sch"


def _extension(name: str) -> str:
    lowered = name.lower()
    # Extensions composées KiCad d'abord (splitext ne les capte pas).
    for ext in (KICAD_BOARD, KICAD_SCH):
        if lowered.endswith(ext):
            return ext
    return os.path.splitext(lowered)[1]


def detect_cao(filenames: List[str]) -> Optional[Dict]:
    """Identifie le type CAO d'un lot de fichiers et apparie carte + schéma.

    Retourne ``None`` si aucun fichier CAO reconnu. Sinon un dict :
    ``{kind, board, schematic, supported, message}``. Eagle est prioritaire si
    un mélange est déposé (KiCad étant reporté).
    """
    tagged = [(name, _extension(name)) for name in filenames]

    def first(ext):
        return next((name for name, e in tagged if e == ext), None)

    eagle_board = first(EAGLE_BOARD)
    eagle_sch = first(EAGLE_SCH)
    kicad_board = first(KICAD_BOARD)
    kicad_sch = first(KICAD_SCH)

    if eagle_board:
        return {
            "kind": "eagle",
            "board": eagle_board,
            "schematic": eagle_sch,
            "supported": True,
            "message": None if eagle_sch else "Schéma .sch absent : les MPN ne seront pas enrichis.",
        }
    if kicad_board:
        return {
            "kind": "kicad",
            "board": kicad_board,
            "schematic": kicad_sch,
            "supported": False,
            "message": "Support KiCad à venir (parseur non implémenté).",
        }
    return None
