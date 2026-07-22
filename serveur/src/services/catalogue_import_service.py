"""Parcours du dépôt de conception pour l'import en masse du catalogue (prompt 011).

**Lecture seule** d'un dossier racine (réglage applicatif, jamais codé en dur) :

    <racine>/KT<référence> - <nom carte>/Rev.<X>/Conception/<fichiers CAO>

Ce service ne fait que **scanner** (aucune écriture, aucune session DB) : il
extrait référence/nom depuis le dossier carte, la révision depuis ``Rev.X``, et
détecte le type CAO des fichiers de ``Conception/`` (Eagle vs KiCad). L'import
réel (création BomReference/Revision/Items/Components) est piloté par la route,
qui réutilise la chaîne d'import CAO (006).
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from typing import Dict, List, Optional

from .cao.detect import detect_cao

_CARD_RE = re.compile(r"^(KT\d+[A-Za-z]?)\s*-\s*(.+)$")
_REV_RE = re.compile(r"^Rev\.?\s*([A-Za-z0-9]+)$", re.IGNORECASE)


def parse_card_folder(name: str):
    """« KT190562 - NanoSH MK2 » → (``KT190562``, ``NanoSH MK2``) ; ``None`` sinon."""
    match = _CARD_RE.match(str(name or "").strip())
    if not match:
        return None
    return match.group(1), match.group(2).strip()


def _conception_dir(rev_dir: str) -> str:
    """Sous-dossier ``Conception`` (insensible à la casse) ou le dossier révision."""
    try:
        for entry in os.listdir(rev_dir):
            path = os.path.join(rev_dir, entry)
            if os.path.isdir(path) and entry.lower() == "conception":
                return path
    except OSError:
        pass
    return rev_dir


def _cao_files_in(dir_path: str) -> Dict[str, str]:
    """{ nom_fichier: chemin_absolu } des fichiers du dossier (non récursif)."""
    files: Dict[str, str] = {}
    if not os.path.isdir(dir_path):
        return files
    try:
        for entry in sorted(os.listdir(dir_path)):
            path = os.path.join(dir_path, entry)
            if os.path.isfile(path):
                files[entry] = path
    except OSError:
        pass
    return files


@dataclass
class ScannedRevision:
    revision: str
    kind: Optional[str]           # "eagle" / "kicad" / None
    supported: bool               # Eagle importable
    files: Dict[str, str] = field(default_factory=dict)  # nom → chemin


@dataclass
class ScannedCard:
    reference: str
    name: str
    revisions: List[ScannedRevision] = field(default_factory=list)


@dataclass
class CatalogueScan:
    root_path: Optional[str]
    exists: bool
    cards: List[ScannedCard] = field(default_factory=list)
    skipped_dirs: List[str] = field(default_factory=list)  # dossiers hors convention


def scan_catalogue(root_path: Optional[str]) -> CatalogueScan:
    """Parcourt la racine et renvoie la structure (cartes, révisions, type CAO).

    Tolère les dossiers hétérogènes (Archives, sans ``Rev.X``, ``Conception``
    manquant) : ils sont **ignorés** et signalés dans ``skipped_dirs``.
    """
    if not root_path or not os.path.isdir(root_path):
        return CatalogueScan(root_path=root_path, exists=False)

    cards: List[ScannedCard] = []
    skipped: List[str] = []

    for card_name in sorted(os.listdir(root_path)):
        card_dir = os.path.join(root_path, card_name)
        if not os.path.isdir(card_dir):
            continue
        parsed = parse_card_folder(card_name)
        if not parsed:
            skipped.append(card_name)
            continue
        reference, name = parsed

        revisions: List[ScannedRevision] = []
        for rev_name in sorted(os.listdir(card_dir)):
            rev_dir = os.path.join(card_dir, rev_name)
            if not os.path.isdir(rev_dir):
                continue
            rev_match = _REV_RE.match(rev_name)
            if not rev_match:
                continue
            revision = rev_match.group(1).upper()
            files = _cao_files_in(_conception_dir(rev_dir))
            detected = detect_cao(list(files.keys()))
            revisions.append(ScannedRevision(
                revision=revision,
                kind=detected["kind"] if detected else None,
                supported=bool(detected and detected.get("supported")),
                files=files,
            ))

        if revisions:
            cards.append(ScannedCard(reference=reference, name=name, revisions=revisions))
        else:
            skipped.append(card_name)

    return CatalogueScan(root_path=root_path, exists=True, cards=cards, skipped_dirs=skipped)
