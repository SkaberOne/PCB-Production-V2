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

# Séparateur réf/nom tolérant (prompt 021) : tiret, underscore, tiret long, ou
# un/plusieurs espaces, avec espaces optionnels autour. La référence reste KT<num>[lettre].
_CARD_RE = re.compile(r"^(KT\d+[A-Za-z]?)(?:\s*[-_\u2013\u2014]+\s*|\s+)(.+)$")
# Référence seule (aucun nom après) : importée avec un nom vide, jamais ignorée.
_CARD_REF_ONLY_RE = re.compile(r"^(KT\d+[A-Za-z]?)$")
# Ressemble à une carte KT (pour distinguer « format non reconnu » de « pas une carte »).
_LOOKS_KT_RE = re.compile(r"^KT\d", re.IGNORECASE)
_REV_RE = re.compile(r"^Rev\.?\s*([A-Za-z0-9]+)$", re.IGNORECASE)


def parse_card_folder(name: str):
    """Extrait (référence, nom) d'un dossier carte, séparateur tolérant (prompt 021).

    « KT190562 - NanoSH MK2 » → (``KT190562``, ``NanoSH MK2``) ;
    « KT190300 MPX 1.0 » (espace) → (``KT190300``, ``MPX 1.0``) ;
    « KT200026 » (référence seule) → (``KT200026``, ``""``) ;
    ``None`` si le dossier ne commence pas par une référence ``KT<num>``.
    """
    raw = str(name or "").strip()
    match = _CARD_RE.match(raw)
    if match:
        return match.group(1), match.group(2).strip()
    ref_only = _CARD_REF_ONLY_RE.match(raw)
    if ref_only:
        return ref_only.group(1), ""
    return None


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


# Raisons de mise à l'écart d'un dossier (prompt 021), pour un rapport lisible.
SKIP_LABELS = {
    "not_a_card": "Pas une carte (dossier hors convention KT)",
    "unrecognized_format": "Format de nom non reconnu (référence KT attendue)",
    "no_revision": "Aucune révision Rev.X / fichier CAO exploitable",
}


@dataclass
class SkippedDir:
    name: str
    reason: str                   # code : not_a_card / unrecognized_format / no_revision
    label: str = ""

    def __post_init__(self):
        if not self.label:
            self.label = SKIP_LABELS.get(self.reason, self.reason)


@dataclass
class CatalogueScan:
    root_path: Optional[str]
    exists: bool
    cards: List[ScannedCard] = field(default_factory=list)
    skipped: List[SkippedDir] = field(default_factory=list)  # dossiers écartés + raison

    @property
    def skipped_dirs(self) -> List[str]:
        """Noms seuls des dossiers écartés (compat rétro)."""
        return [d.name for d in self.skipped]


def scan_catalogue(root_path: Optional[str]) -> CatalogueScan:
    """Parcourt la racine et renvoie la structure (cartes, révisions, type CAO).

    Tolère les dossiers hétérogènes (Archives, sans ``Rev.X``, ``Conception``
    manquant) : ils sont **ignorés** et signalés dans ``skipped_dirs``.
    """
    if not root_path or not os.path.isdir(root_path):
        return CatalogueScan(root_path=root_path, exists=False)

    cards: List[ScannedCard] = []
    skipped: List[SkippedDir] = []

    for card_name in sorted(os.listdir(root_path)):
        card_dir = os.path.join(root_path, card_name)
        if not os.path.isdir(card_dir):
            continue
        parsed = parse_card_folder(card_name)
        if not parsed:
            # Distingue « format non reconnu » (ressemble à une carte KT) de
            # « pas une carte » (Archives, history, dossiers hors convention).
            reason = "unrecognized_format" if _LOOKS_KT_RE.match(card_name.strip()) else "not_a_card"
            skipped.append(SkippedDir(name=card_name, reason=reason))
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
            skipped.append(SkippedDir(name=card_name, reason="no_revision"))

    return CatalogueScan(root_path=root_path, exists=True, cards=cards, skipped=skipped)
