"""
BOM file parser for Eagle-style TXT exports.

The parser is intentionally tolerant:
- it skips optional header rows
- it accepts empty values
- it reconstructs values containing spaces by parsing columns from the right
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

HEADER_REFERENCE_TOKENS = {"reference", "ref", "designator"}
HEADER_TRAILING_TOKENS = {"type", "side"}
DNP_MARKER_TOKENS = {"DNP"}
PLACEMENT_SIDE_MAP = {
    "T": "TOP",
    "TOP": "TOP",
    "B": "BOT",
    "BOT": "BOT",
}


def infer_component_type(reference: str) -> str:
    """Infer the component family from its reference designator."""
    normalized_reference = (reference or "").strip().upper()
    if normalized_reference.startswith("IC"):
        return "IC"

    match = re.match(r"[A-Z]+", normalized_reference)
    return match.group(0) if match else "U"


@dataclass
class ParsedBomItem:
    """Normalized representation of a parsed BOM row."""

    reference: str
    value_raw: str
    footprint_eagle: str
    x: float
    y: float
    rotation: int
    type: str
    component_type: str
    dnp: bool
    line_num: int

    def to_dict(self) -> Dict[str, object]:
        """Expose the item as a legacy dict for existing callers."""
        return {
            "reference": self.reference,
            "value_raw": self.value_raw,
            "footprint_eagle": self.footprint_eagle,
            "footprint": self.footprint_eagle,
            "x": self.x,
            "y": self.y,
            "rotation": self.rotation,
            "type": self.type,
            "component_type": self.component_type,
            "dnp": self.dnp,
        }


@dataclass
class BomParseResult:
    """Full parser result with items and diagnostics."""

    items: List[ParsedBomItem]
    errors: List[str]
    warnings: List[str]


class BomParser:
    """Parser for Eagle BOM .txt files."""

    def __init__(self, file_path: Optional[str] = None):
        self.file_path = file_path
        self.errors: List[str] = []
        self.warnings: List[str] = []

    def parse_file(self, file_path: Optional[str] = None) -> BomParseResult:
        """
        Parse an Eagle BOM text file.

        Args:
            file_path: Path to the file. If omitted, the parser uses the path
                provided during initialization.

        Returns:
            BomParseResult with parsed items plus warnings and errors.
        """
        self.errors = []
        self.warnings = []

        path = Path(file_path or self.file_path or "")
        if not path.exists():
            raise FileNotFoundError(f"BOM file not found: {path}")

        items = self._parse_with_fallback_encodings(path)

        logger.info("Parsed %s BOM items from %s", len(items), path.name)
        if self.errors:
            logger.warning("Parse errors: %s", len(self.errors))
        if self.warnings:
            logger.info("Parse warnings: %s", len(self.warnings))

        return BomParseResult(
            items=items,
            errors=self.errors.copy(),
            warnings=self.warnings.copy(),
        )

    def _parse_with_fallback_encodings(self, path: Path) -> List[ParsedBomItem]:
        """Try common encodings without duplicating parsing logic."""
        encodings = ("utf-8", "latin-1")
        last_error: Optional[UnicodeDecodeError] = None

        for encoding in encodings:
            try:
                return self._parse_path(path, encoding)
            except UnicodeDecodeError as exc:
                last_error = exc
                logger.warning("Failed to read %s as %s", path.name, encoding)

        if last_error:
            raise last_error

        return []

    def _parse_path(self, path: Path, encoding: str) -> List[ParsedBomItem]:
        items: List[ParsedBomItem] = []

        with path.open("r", encoding=encoding) as bom_file:
            for line_num, line in enumerate(bom_file, start=1):
                if not line.strip():
                    continue

                item = self._parse_line(line, line_num)
                if item:
                    items.append(item)

        return items

    def _parse_line(self, line: str, line_num: int) -> Optional[ParsedBomItem]:
        """
        Parse a single BOM row.

        The parser reads the numeric/location columns from the right to support
        value fields that may contain spaces.
        """
        parts = line.split()

        if self._is_header_line(parts):
            return None

        has_dnp_marker = parts[-1].upper() in DNP_MARKER_TOKENS
        minimum_columns = 7 if has_dnp_marker else 6
        if len(parts) < minimum_columns:
            self.errors.append(
                f"Line {line_num}: Not enough columns ({len(parts)} < {minimum_columns})"
            )
            return None

        reference = parts[0]
        placement_index = -2 if has_dnp_marker else -1
        rotation_index = -3 if has_dnp_marker else -2
        y_index = -4 if has_dnp_marker else -3
        x_index = -5 if has_dnp_marker else -4
        footprint_index = -6 if has_dnp_marker else -5

        try:
            x = float(parts[x_index])
            y = float(parts[y_index])
            rotation = int(float(parts[rotation_index]))
        except ValueError as exc:
            self.errors.append(f"Line {line_num}: Invalid numeric values - {exc}")
            return None

        footprint_eagle = parts[footprint_index]
        value_raw = " ".join(parts[1:footprint_index]).strip()
        placement_token = parts[placement_index].upper()
        normalized_side = PLACEMENT_SIDE_MAP.get(placement_token, placement_token)

        if placement_token not in PLACEMENT_SIDE_MAP:
            self.warnings.append(
                f"Line {line_num}: Unexpected placement side '{parts[placement_index]}' for {reference}"
            )

        if not value_raw:
            self.warnings.append(f"Line {line_num}: Empty value for {reference}")
        elif "xxx" in value_raw.lower():
            self.warnings.append(
                f"Line {line_num}: Placeholder value '{value_raw}' for {reference}"
            )

        return ParsedBomItem(
            reference=reference,
            value_raw=value_raw,
            footprint_eagle=footprint_eagle,
            x=x,
            y=y,
            rotation=rotation,
            type=normalized_side,
            component_type=infer_component_type(reference),
            dnp=has_dnp_marker,
            line_num=line_num,
        )

    @staticmethod
    def _is_header_line(parts: List[str]) -> bool:
        """Detect and skip optional header lines."""
        if len(parts) < 6:
            return False

        first_token = parts[0].strip().lower()
        last_token = parts[-1].strip().lower()
        penultimate_token = parts[-2].strip().lower() if len(parts) >= 2 else ""
        return first_token in HEADER_REFERENCE_TOKENS and (
            last_token in HEADER_TRAILING_TOKENS
            or (last_token == "dnp" and penultimate_token in HEADER_TRAILING_TOKENS)
        )

    def get_stats(self, items: List[Dict]) -> Dict[str, object]:
        """Get basic statistics about parsed BOM content."""
        if not items:
            return {
                "total_items": 0,
                "by_bom_type": {},
                "by_component_type": {},
                "errors": len(self.errors),
                "warnings": len(self.warnings),
            }

        by_bom_type: Dict[str, int] = {}
        by_component_type: Dict[str, int] = {}

        for item in items:
            bom_type = str(item.get("type", "UNKNOWN"))
            by_bom_type[bom_type] = by_bom_type.get(bom_type, 0) + 1

            component_type = str(item.get("component_type") or infer_component_type(item.get("reference", "")))
            by_component_type[component_type] = by_component_type.get(component_type, 0) + 1

        return {
            "total_items": len(items),
            "by_bom_type": by_bom_type,
            "by_component_type": by_component_type,
            "errors": len(self.errors),
            "warnings": len(self.warnings),
        }


def parse_bom_file(file_path: str) -> Tuple[List[Dict], Dict[str, object]]:
    """
    Backward-compatible helper returning parsed items as dicts plus stats.
    """
    parser = BomParser()
    parse_result = parser.parse_file(file_path)
    parsed_items = [item.to_dict() for item in parse_result.items]
    stats = parser.get_stats(parsed_items)
    return parsed_items, stats
