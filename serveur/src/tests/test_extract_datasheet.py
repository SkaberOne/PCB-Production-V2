"""Tests pour le script d'extraction datasheet (parsing + fusion EIA-481 + rendu)."""

import extract_datasheet as ed

SAMPLE_TEXT = """
ACME CAPACITOR 100nF 0805
Packaging Information
Packaging: Tape and Reel
Tape width: 8 mm
Component pitch: 4 mm
Quantity per reel: 4,000 pcs
Reel diameter: 178 mm
Hub diameter: 60 mm
"""


class TestParseDatasheetText:
    def test_extracts_core_fields(self):
        parsed = ed.parse_datasheet_text(SAMPLE_TEXT)
        assert parsed["pitch_mm"] == 4.0
        assert parsed["tape_width_mm"] == 8.0
        assert parsed["qty_per_reel"] == 4000
        assert parsed["reel_outer_diameter_mm"] == 178.0
        assert parsed["reel_hub_diameter_mm"] == 60.0
        assert parsed["packaging"] == "Tape & Reel"

    def test_empty_text_returns_none_fields(self):
        parsed = ed.parse_datasheet_text("")
        assert parsed["pitch_mm"] is None
        assert parsed["tape_width_mm"] is None
        assert parsed["packaging"] is None


class TestMergeWithEia:
    def test_pdf_and_eia_agree_high_confidence(self):
        parsed = ed.parse_datasheet_text(SAMPLE_TEXT)
        merged = ed.merge_with_eia(parsed, "0805")
        assert merged["pitch_mm"] == 4.0
        assert merged["tape_width_mm"] == 8.0
        assert merged["feeder"] == "CL8"
        assert merged["confidence"] == "haute"

    def test_eia_fills_when_pdf_missing(self):
        merged = ed.merge_with_eia(
            {
                "pitch_mm": None,
                "tape_width_mm": None,
                "qty_per_reel": None,
                "reel_outer_diameter_mm": None,
                "reel_hub_diameter_mm": None,
                "packaging": None,
            },
            "SOIC-8",
        )
        assert merged["pitch_mm"] == 8.0
        assert merged["tape_width_mm"] == 12.0
        assert merged["feeder"] == "CL12"
        assert merged["pitch_source"] == "EIA-481"
        assert merged["confidence"] == "moyenne"

    def test_no_data_low_confidence(self):
        merged = ed.merge_with_eia(
            {
                "pitch_mm": None,
                "tape_width_mm": None,
                "qty_per_reel": None,
                "reel_outer_diameter_mm": None,
                "reel_hub_diameter_mm": None,
                "packaging": None,
            },
            "BOITIER_INCONNU",
        )
        assert merged["feeder"] is None
        assert merged["confidence"] == "basse"


class TestRenderMarkdown:
    def test_contains_expected_sections(self):
        parsed = ed.parse_datasheet_text(SAMPLE_TEXT)
        merged = ed.merge_with_eia(parsed, "0805")
        md = ed.render_markdown("C0805_100NF", "ACME-100N-0805", "0805", merged,
                                "data/datasheets/pdf/C0805_100NF.pdf")
        assert "# C0805_100NF — ACME-100N-0805" in md
        assert "## Packaging" in md
        assert "## Bande (tape)" in md
        assert "## Bobine" in md
        assert "178.0 mm" in md
        assert "Feeder recommandé : CL8" in md
        assert "Confiance : haute" in md
