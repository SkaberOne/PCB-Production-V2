"""Service d'import CAO — brancher le parseur Eagle (003) sur la chaîne
d'import/harmonisation BOM existante (prompt 006 / 003 incrément 2).

Le parseur (``services/cao``) produit les composants placés + centroïde. Ce
service les transforme en **texte machine** (``Réf Valeur Empreinte X Y Angle
Face``, une face par bloc — comme les exports ``_TOP.txt`` / ``_BOT.txt``) que le
parseur BOM existant (``utils/file_parser.BomParser``) sait relire : ainsi
l'harmonisation (valeurs + empreintes) et la persistance restent **inchangées**
(aucune duplication de la chaîne). Un revision est créé par face présente.

KiCad est reconnu mais reporté (message « à venir »).
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Dict, List, Optional

from .detect import detect_cao
from .parser_eagle import EagleParser

# Face machine (une lettre) → côté logique BomRevision.
_PLACEMENT_FACES = {"T": "TOP", "B": "BOT"}


def _format_number(value) -> str:
    """Nombre → texte compact (entier sans « .0 », sinon décimal nettoyé)."""
    if value is None:
        return "0"
    if isinstance(value, float):
        if value.is_integer():
            return str(int(value))
        text = f"{value:.4f}".rstrip("0").rstrip(".")
        return text or "0"
    return str(value)


def _collapse_spaces(value: str) -> str:
    """Espaces internes → underscore (garantit une colonne unique)."""
    return re.sub(r"\s+", "_", str(value or "").strip())


@dataclass
class CaoFaceText:
    """Contenu texte machine d'une face (prêt pour ``BomParser``)."""

    side: str  # "TOP" / "BOT"
    text: str  # lignes ``Réf Valeur Empreinte X Y Angle Face`` (sans en-tête)
    count: int


@dataclass
class CaoPreparation:
    """Résultat de la préparation d'un lot de fichiers CAO."""

    kind: str  # "eagle" / "kicad"
    supported: bool
    board: Optional[str]
    schematic: Optional[str]
    message: Optional[str]
    faces: List[CaoFaceText] = field(default_factory=list)
    height: Optional[float] = None
    total_components: int = 0
    warnings: List[str] = field(default_factory=list)


def _placement_line(placed: Dict) -> Optional[str]:
    """Une ligne texte machine depuis un placement, ou ``None`` si inexploitable.

    Format : ``Réf Valeur Empreinte X Y Angle Face``. La valeur peut contenir
    des espaces (le parseur BOM lit les colonnes depuis la droite) ; l'empreinte
    est « collapsée » pour rester une colonne unique. Sans empreinte (ou sans
    référence) → ``None`` : une ligne machine sans empreinte casserait la
    validation d'import ; le composant est alors reporté en warning par
    l'appelant (curation en aval, cf. logo/test points).
    """
    footprint = _collapse_spaces(placed.get("footprint") or "")
    if not footprint:
        return None
    reference = _collapse_spaces(placed.get("reference_item") or "")
    if not reference:
        return None

    value = str(placed.get("value") or "").strip()
    parts = [reference]
    if value:
        parts.append(value)
    parts.extend(
        [
            footprint,
            _format_number(placed.get("x")),
            _format_number(placed.get("y")),
            _format_number(placed.get("angle")),
            str(placed.get("face") or "T"),
        ]
    )
    return " ".join(parts)


def prepare_cao_import(files: Dict[str, str]) -> Optional[CaoPreparation]:
    """Détecte + parse un lot de fichiers CAO → texte machine par face.

    ``files`` : ``{ nom_fichier_original: chemin_disque }`` (le nom sert à la
    détection par extension, le chemin à la lecture). Retourne ``None`` si aucun
    fichier CAO n'est reconnu.
    """
    detected = detect_cao(list(files.keys()))
    if detected is None:
        return None

    if not detected.get("supported"):
        # KiCad (ou autre) reconnu mais parseur reporté : on remonte le message.
        return CaoPreparation(
            kind=detected["kind"],
            supported=False,
            board=detected.get("board"),
            schematic=detected.get("schematic"),
            message=detected.get("message"),
        )

    board_path = files[detected["board"]]
    schematic_name = detected.get("schematic")
    schematic_path = files.get(schematic_name) if schematic_name else None

    components, height = EagleParser.parse_with_height(board_path, schematic_path)

    lines_by_side: Dict[str, List[str]] = {"TOP": [], "BOT": []}
    skipped_no_footprint: List[str] = []

    for component in components:
        placed = EagleParser.to_machine_placement(component, height)
        side = _PLACEMENT_FACES.get(placed.get("face"), "TOP")
        line = _placement_line(placed)
        if line is None:
            skipped_no_footprint.append(component.get("reference_item") or "?")
            continue
        lines_by_side[side].append(line)

    warnings: List[str] = []
    if detected.get("message"):
        warnings.append(detected["message"])
    if skipped_no_footprint:
        warnings.append(
            "Composant(s) sans empreinte ignoré(s) : "
            + ", ".join(sorted(skipped_no_footprint))
        )

    faces = [
        CaoFaceText(side=side, text="\n".join(lines), count=len(lines))
        for side, lines in (("TOP", lines_by_side["TOP"]), ("BOT", lines_by_side["BOT"]))
        if lines
    ]

    return CaoPreparation(
        kind=detected["kind"],
        supported=True,
        board=detected.get("board"),
        schematic=schematic_name,
        message=detected.get("message"),
        faces=faces,
        height=height,
        total_components=sum(face.count for face in faces),
        warnings=warnings,
    )
