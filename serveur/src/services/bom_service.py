"""
BOM import service.

Centralizes the full import pipeline:
- parse the raw file
- harmonize component values
- expose a single result object for routes and tests
"""

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple

from ..utils.file_parser import BomParser
from .harmony_rules import harmonize_bom_items

logger = logging.getLogger(__name__)


@dataclass
class BomImportResult:
    """Result of a BOM import operation."""

    success: bool
    items: List[Dict]
    errors: List[str]
    warnings: List[str]
    stats: Dict[str, int]


class BomService:
    """Service for BOM import, harmonization, and validation."""

    def __init__(self):
        self.parser = BomParser()

    def import_bom(
        self,
        file_path: str,
        footprint_lookup: Optional[Dict[str, str]] = None,
    ) -> BomImportResult:
        """Import and harmonize a BOM file."""
        try:
            parse_result = self.parser.parse_file(file_path)
            parsed_items = [item.to_dict() for item in parse_result.items]

            if not parsed_items:
                return BomImportResult(
                    success=False,
                    items=[],
                    errors=parse_result.errors or ["No BOM items could be parsed"],
                    warnings=parse_result.warnings,
                    stats={},
                )

            harmonized_items = harmonize_bom_items(parsed_items)
            harmonized_items, mapping_warnings = self.apply_footprint_mappings(
                harmonized_items,
                footprint_lookup or {},
            )
            stats = self._calculate_stats(harmonized_items)

            return BomImportResult(
                success=True,
                items=harmonized_items,
                errors=parse_result.errors,
                warnings=[*parse_result.warnings, *mapping_warnings],
                stats=stats,
            )

        except Exception as exc:
            logger.exception("Error importing BOM from %s", file_path)
            return BomImportResult(
                success=False,
                items=[],
                errors=[f"Import failed: {exc}"],
                warnings=[],
                stats={},
            )

    def _calculate_stats(self, items: List[Dict]) -> Dict[str, int]:
        """Calculate high-level statistics from harmonized items."""
        stats = {
            "total_components": len(items),
            "auto_harmonized": 0,
            "manual_review": 0,
            "resistors": 0,
            "capacitors": 0,
            "other_components": 0,
        }

        for item in items:
            value_raw = item.get("value_raw")
            value_harmonized = item.get("value_harmonized")

            if value_harmonized and value_harmonized != value_raw:
                stats["auto_harmonized"] += 1
            else:
                stats["manual_review"] += 1

            component_type = item.get("component_type", "")
            if component_type in {"R", "RESISTOR"}:
                stats["resistors"] += 1
            elif component_type in {"C", "CAPACITOR"}:
                stats["capacitors"] += 1
            else:
                stats["other_components"] += 1

        return stats

    def calculate_stats(self, items: List[Dict]) -> Dict[str, int]:
        """Public wrapper used by routes when items are edited after import."""
        return self._calculate_stats(items)

    @staticmethod
    def normalize_footprint_name(value: str) -> str:
        """Normalize an Eagle footprint key for lookup/storage."""
        return (value or "").strip().upper()

    def apply_footprint_mappings(
        self,
        items: List[Dict],
        footprint_lookup: Dict[str, str],
    ) -> Tuple[List[Dict], List[str]]:
        """Apply known Eagle -> PnP mappings and report unmapped footprints."""
        mapped_items: List[Dict] = []
        missing_footprints: Set[str] = set()

        for item in items:
            mapped_item = item.copy()
            footprint_eagle = mapped_item.get("footprint_eagle")
            footprint_key = self.normalize_footprint_name(footprint_eagle)

            if footprint_key and not mapped_item.get("footprint_pnp"):
                mapped_item["footprint_pnp"] = footprint_lookup.get(footprint_key)

            if footprint_key and not mapped_item.get("footprint_pnp") and not mapped_item.get("dnp"):
                missing_footprints.add(footprint_eagle)

            mapped_items.append(mapped_item)

        warnings = [
            f"No PnP mapping found for footprint '{footprint}'"
            for footprint in sorted(missing_footprints)
        ]

        return mapped_items, warnings

    def validate_bom_data(self, items: List[Dict]) -> Tuple[bool, List[str]]:
        """Validate the harmonized payload before database persistence."""
        errors: List[str] = []
        required_fields = ["reference", "footprint_eagle", "x", "y", "rotation", "type"]

        for index, item in enumerate(items, start=1):
            for field in required_fields:
                if field not in item or item[field] in (None, ""):
                    errors.append(f"Item {index}: Missing required field '{field}'")

            try:
                float(item.get("x", 0))
                float(item.get("y", 0))
            except (TypeError, ValueError):
                errors.append(
                    f"Item {index}: Invalid coordinates (x={item.get('x')}, y={item.get('y')})"
                )

            try:
                int(float(item.get("rotation", 0)))
            except (TypeError, ValueError):
                errors.append(f"Item {index}: Invalid rotation '{item.get('rotation')}'")

        return len(errors) == 0, errors


def test_bom_import():
    """Quick local smoke test against the sample BOM file in the repo root."""
    service = BomService()
    bom_file = Path(__file__).resolve().parents[3] / "test_bom.txt"

    if not bom_file.exists():
        logger.warning("BOM file not found: %s", bom_file)
        return

    result = service.import_bom(str(bom_file))
    logger.info("Success: %s", result.success)
    logger.info("Items processed: %s", len(result.items))
    logger.info("Errors: %s", len(result.errors))
    logger.info("Warnings: %s", len(result.warnings))
    logger.info("Stats: %s", result.stats)


if __name__ == "__main__":
    test_bom_import()
