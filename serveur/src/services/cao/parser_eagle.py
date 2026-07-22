"""Parseur CAO Eagle (.brd + .sch) — prompt 003 / échange E02.

Porté du parseur de référence validé (``fixtures/eagle_otr/parser_eagle_reference.py``,
fourni par la planif). Extrait **tous** les composants placés (BOM + centroïde) et
calcule la transformation coordonnées carte → machine. La curation (exclusions
connecteurs / test points / logo / DNP) se fait **en aval** (Revue BOM / règle PnP) :
le parseur n'exclut rien.
"""

import re
import xml.etree.ElementTree as ET
from typing import Dict, List, Optional

from .parser_base import CaoParser


def _natural_ref_key(component: Dict):
    ref = component.get("reference_item") or ""
    match = re.match(r"([A-Za-z]+)(\d+)", ref)
    return (match.group(1), int(match.group(2))) if match else (ref, 0)


def parse_rotation(rot: Optional[str]):
    """(side, angle) depuis un attribut Eagle ``rot`` (ex. ``MR90``, ``R270``).

    Le préfixe ``M`` = miroir = face **bottom** ; sinon **top**.
    """
    rot = rot or "R0"
    side = "bottom" if "M" in rot.upper() else "top"
    match = re.search(r"(\d+)", rot)
    angle = int(match.group(1)) if match else 0
    return side, angle % 360


class EagleParser(CaoParser):
    kind = "eagle"

    # ── Hauteur de retournement (contour, layer 20 « Dimension ») ─────────────
    @staticmethod
    def flip_height(board_root) -> Optional[float]:
        """Hauteur de retournement ``H`` = **span** vertical du contour
        (wires ``layer="20"`` « Dimension ») = ``y_max − y_min``.

        Sert au miroir de la face bottom (``y → H − y``). Calé sur la vérité
        terrain des fichiers machine fournis (``y_brd + y_machine = H``) : sur la
        carte OTR, contour y∈[−0.2, 34.0] → ``H = 34.0 − (−0.2) = 34.20``.
        (Le libellé « y_min + y_max » de l'échange E02 suppose ``y_min = 0`` ;
        ici le contour descend à −0.2, donc on prend le span qui recale sur les
        ``.txt`` machine.)
        """
        ys: List[float] = []
        for wire in board_root.iter("wire"):
            if wire.get("layer") != "20":
                continue
            for attr in ("y1", "y2"):
                value = wire.get(attr)
                if value is None:
                    continue
                try:
                    ys.append(float(value))
                except ValueError:
                    continue
        if not ys:
            return None
        return round(max(ys) - min(ys), 4)

    # ── MPN depuis le schéma ──────────────────────────────────────────────────
    @staticmethod
    def _mpn_by_reference(schematic_root) -> Dict[str, str]:
        """``{référence: MPN}`` via ``MANUFACTURER_PART_NUMBER``.

        Dans Eagle l'attribut n'est pas porté par le ``<part>`` mais par la
        **techno du device** dans la librairie : ``<library><deviceset>…
        <technology><attribute name="MANUFACTURER_PART_NUMBER">``. On indexe donc
        par ``(library, deviceset)`` puis on rattache chaque part. Repli : un
        éventuel attribut directement sur le part/instance.
        """
        mpn: Dict[str, str] = {}
        if schematic_root is None:
            return mpn

        by_deviceset: Dict[tuple, str] = {}
        for library in schematic_root.iter("library"):
            lib_name = library.get("name")
            for deviceset in library.iter("deviceset"):
                ds_name = deviceset.get("name")
                for attr in deviceset.iter("attribute"):
                    if attr.get("name") == "MANUFACTURER_PART_NUMBER" and attr.get("value"):
                        by_deviceset[(lib_name, ds_name)] = attr.get("value")
                        break

        for part in schematic_root.iter("part"):
            name = part.get("name")
            key = (part.get("library"), part.get("deviceset"))
            if key in by_deviceset:
                mpn[name] = by_deviceset[key]
            else:
                for attr in part.iter("attribute"):
                    if attr.get("name") == "MANUFACTURER_PART_NUMBER" and attr.get("value"):
                        mpn[name] = attr.get("value")
                        break
        return mpn

    # ── Extraction ────────────────────────────────────────────────────────────
    @classmethod
    def parse(cls, board_path: str, schematic_path: Optional[str] = None) -> List[Dict]:
        board_root = ET.parse(board_path).getroot()
        schematic_root = ET.parse(schematic_path).getroot() if schematic_path else None
        mpn = cls._mpn_by_reference(schematic_root)

        components: List[Dict] = []
        for element in board_root.iter("element"):
            side, angle = parse_rotation(element.get("rot"))
            try:
                x = float(element.get("x"))
                y = float(element.get("y"))
            except (TypeError, ValueError):
                continue
            reference = element.get("name")
            components.append({
                "reference_item": reference,
                "value_raw": (element.get("value") or "").strip(),
                "footprint_eagle": element.get("package") or "",
                "x": x,
                "y": y,
                "rotation": angle,
                "placement_side": side,
                "mpn": mpn.get(reference, ""),
            })
        components.sort(key=_natural_ref_key)
        return components

    @classmethod
    def parse_with_height(cls, board_path: str, schematic_path: Optional[str] = None):
        """Comme ``parse`` mais renvoie aussi ``H`` : ``(components, flip_height)``."""
        board_root = ET.parse(board_path).getroot()
        height = cls.flip_height(board_root)
        return cls.parse(board_path, schematic_path), height

    # ── Transformation carte → placement machine ──────────────────────────────
    @staticmethod
    def to_machine_placement(component: Dict, flip_height: Optional[float]) -> Dict:
        """Coordonnées machine d'un composant.

        Top = identité. Bottom : ``x`` inchangé, ``y → H − y``, ``rot → (rot+180) % 360``.
        Format aligné sur l'export machine : ``Réf Valeur Empreinte X Y Angle Face`` (``T``/``B``).
        """
        x = component["x"]
        y = component["y"]
        rotation = component["rotation"]
        if component["placement_side"] == "bottom":
            if flip_height is not None:
                y = flip_height - y
            rotation = (rotation + 180) % 360
        return {
            "reference_item": component["reference_item"],
            "value": component.get("value_raw", ""),
            "footprint": component.get("footprint_eagle", ""),
            "x": round(x, 2),
            "y": round(y, 2),
            "angle": rotation % 360,
            "face": "B" if component["placement_side"] == "bottom" else "T",
        }
