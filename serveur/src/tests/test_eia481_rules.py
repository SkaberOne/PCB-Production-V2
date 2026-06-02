"""Tests pour la table de correspondance EIA-481 (boîtier -> pitch/largeur/feeder)."""

from src.services.eia481_rules import (
    default_tape_thickness_mm,
    feeder_for_tape_width,
    lookup_package,
)


class TestFeederForTapeWidth:
    def test_known_widths(self):
        assert feeder_for_tape_width(8) == "CL8"
        assert feeder_for_tape_width(12) == "CL12"
        assert feeder_for_tape_width(16) == "CL16"
        assert feeder_for_tape_width(24) == "CL24"

    def test_invalid_width(self):
        assert feeder_for_tape_width(0) is None
        assert feeder_for_tape_width(None) is None


class TestDefaultTapeThickness:
    def test_width_based(self):
        assert default_tape_thickness_mm(8) == 1.0
        assert default_tape_thickness_mm(12) == 1.2
        assert default_tape_thickness_mm(16) == 1.5
        assert default_tape_thickness_mm(24) == 1.5

    def test_unknown_width(self):
        assert default_tape_thickness_mm(0) == 1.0
        assert default_tape_thickness_mm(None) == 1.0


class TestLookupPackage:
    def test_passive_4mm(self):
        result = lookup_package("0805")
        assert result["matched"] is True
        assert result["pitch_mm"] == 4.0
        assert result["tape_width_mm"] == 8.0
        assert result["feeder"] == "CL8"
        assert result["tape_thickness_mm"] == 1.0

    def test_tiny_passive_2mm(self):
        result = lookup_package("0402")
        assert result["pitch_mm"] == 2.0
        assert result["tape_width_mm"] == 8.0
        assert result["feeder"] == "CL8"

    def test_strips_designator_prefix(self):
        # R0805 / C0603 doivent être reconnus comme 0805 / 0603
        assert lookup_package("R0805")["pitch_mm"] == 4.0
        assert lookup_package("C0603")["pitch_mm"] == 4.0

    def test_normalizes_separators(self):
        assert lookup_package("SOT-23")["tape_width_mm"] == 8.0
        assert lookup_package("sot 23")["tape_width_mm"] == 8.0

    def test_medium_ic_12mm(self):
        result = lookup_package("SOIC-8")
        assert result["pitch_mm"] == 8.0
        assert result["tape_width_mm"] == 12.0
        assert result["feeder"] == "CL12"

    def test_large_ic_24mm(self):
        result = lookup_package("LQFP100")
        assert result["tape_width_mm"] == 24.0
        assert result["feeder"] == "CL24"

    def test_unknown_package(self):
        result = lookup_package("MON_BOITIER_INCONNU")
        assert result["matched"] is False
        assert result["pitch_mm"] is None
        assert result["feeder"] is None

    def test_empty_package(self):
        result = lookup_package("")
        assert result["matched"] is False


class TestExtendedPackages:
    def test_so8_like_soic(self):
        result = lookup_package("SO-8")
        assert result["pitch_mm"] == 8.0
        assert result["tape_width_mm"] == 12.0
        assert result["feeder"] == "CL12"

    def test_sod_and_small_sot(self):
        assert lookup_package("SOD-123")["feeder"] == "CL8"
        assert lookup_package("SOT-363")["tape_width_mm"] == 8.0
        assert lookup_package("SOT-723")["pitch_mm"] == 2.0

    def test_dpak_and_d2pak(self):
        assert lookup_package("DPAK")["tape_width_mm"] == 16.0
        assert lookup_package("D2PAK")["tape_width_mm"] == 24.0
        # Alias TO-252 / TO-263
        assert lookup_package("TO-252")["feeder"] == "CL16"
        assert lookup_package("TO-263")["feeder"] == "CL24"

    def test_rohm_aliases(self):
        # SMT3 -> SOT-23, UMT3 -> SOT-323, EMT3 -> SOT-723
        assert lookup_package("SMT3")["tape_width_mm"] == 8.0
        assert lookup_package("UMT3")["pitch_mm"] == 4.0
        assert lookup_package("EMT3")["pitch_mm"] == 2.0
