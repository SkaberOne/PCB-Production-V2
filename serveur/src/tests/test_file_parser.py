"""Unit tests for the BOM file parser."""

import os
import sys
import tempfile

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from src.backend.utils.file_parser import BomParser


def write_temp_bom(content: str) -> str:
    """Write BOM content to a temporary file and return its path."""
    with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as temp_file:
        temp_file.write(content)
        return temp_file.name


def test_parse_file_skips_header_and_extracts_items():
    bom_content = """Reference Value Footprint X Y Rotation Type
R1 10 0805 10.0 20.0 0 T
C1 100nf 0603 12.0 24.0 90 B
"""
    temp_path = write_temp_bom(bom_content)

    try:
        parser = BomParser()
        result = parser.parse_file(temp_path)

        assert len(result.items) == 2
        assert result.errors == []
        assert result.items[0].reference == "R1"
        assert result.items[0].type == "TOP"
        assert result.items[1].type == "BOT"
    finally:
        os.unlink(temp_path)


def test_parse_file_supports_missing_value_column():
    bom_content = "C3 C0603 34.43 66.19 270 T\n"
    temp_path = write_temp_bom(bom_content)

    try:
        parser = BomParser()
        result = parser.parse_file(temp_path)

        assert len(result.items) == 1
        assert result.items[0].value_raw == ""
        assert result.items[0].footprint_eagle == "C0603"
        assert any("Empty value" in warning for warning in result.warnings)
    finally:
        os.unlink(temp_path)


def test_parse_file_supports_values_with_spaces():
    bom_content = "R50 Proche de 23.7K RESC1608X55N 40.12 34.15 180 T\n"
    temp_path = write_temp_bom(bom_content)

    try:
        parser = BomParser()
        result = parser.parse_file(temp_path)

        assert len(result.items) == 1
        assert result.items[0].value_raw == "Proche de 23.7K"
        assert result.items[0].footprint_eagle == "RESC1608X55N"
        assert result.items[0].component_type == "R"
    finally:
        os.unlink(temp_path)


def test_parse_file_supports_optional_dnp_marker():
    bom_content = """Reference Value Footprint X Y Rotation Side DNP
R1 10K RESC1608X55N 10.0 20.0 0 T DNP
C1 100n CAPC1608X90N 11.0 21.0 90 B
"""
    temp_path = write_temp_bom(bom_content)

    try:
        parser = BomParser()
        result = parser.parse_file(temp_path)

        assert len(result.items) == 2
        assert result.errors == []
        assert result.items[0].reference == "R1"
        assert result.items[0].dnp is True
        assert result.items[0].type == "TOP"
        assert result.items[1].reference == "C1"
        assert result.items[1].dnp is False
        assert result.items[1].type == "BOT"
    finally:
        os.unlink(temp_path)
