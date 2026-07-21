"""Interface commune des parseurs CAO (prompt 003 / échange E02).

Permet d'ajouter KiCad ultérieurement sans refonte : un nouveau parseur hérite
de ``CaoParser`` et implémente ``parse``. L'orchestration (détection, import) ne
dépend que de cette interface.
"""

from abc import ABC, abstractmethod
from typing import Dict, List, Optional


class CaoParser(ABC):
    """Contrat d'un parseur CAO : produire la liste des composants placés."""

    kind: str = "generic"

    @classmethod
    @abstractmethod
    def parse(cls, board_path: str, schematic_path: Optional[str] = None) -> List[Dict]:
        """Retourne une liste de composants (BOM + centroïde).

        Chaque composant : ``reference_item``, ``value_raw``, ``footprint_eagle``,
        ``x``, ``y``, ``rotation``, ``placement_side`` (``top``/``bottom``), ``mpn``.
        Le parseur extrait **tout** ; la curation (exclusions) se fait en aval.
        """
        raise NotImplementedError
