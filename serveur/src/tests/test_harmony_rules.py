import os
import sys

import pytest

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from src.services.harmony_rules import (
    extract_numeric_and_unit,
    harmonize_resistor_value,
    harmonize_capacitor_value,
    harmonize_value,
    validate_harmonized_value,
    harmonize_bom_items,
)


class TestExtractNumericAndUnit:
    """Test numeric/unit extraction helper function"""
    
    def test_numeric_only(self):
        """Test extraction from pure numeric value"""
        numeric, unit = extract_numeric_and_unit("10")
        assert numeric == "10"
        assert unit is None
    
    def test_with_resistor_unit(self):
        """Test extraction with resistor unit"""
        numeric, unit = extract_numeric_and_unit("2.2k")
        assert numeric == "2.2"
        assert unit == "k"
    
    def test_with_capacitor_unit(self):
        """Test extraction with capacitor unit"""
        numeric, unit = extract_numeric_and_unit("100nf")
        assert numeric == "100"
        assert unit == "nf"
    
    def test_with_whitespace(self):
        """Test extraction with inner whitespace"""
        numeric, unit = extract_numeric_and_unit("100 nf")
        assert numeric == "100"
        assert unit == "nf"
    
    def test_decimal_value(self):
        """Test extraction with decimal value"""
        numeric, unit = extract_numeric_and_unit("1.5")
        assert numeric == "1.5"
        assert unit is None


class TestHarmonizeResistorValue:
    """Test resistor value harmonization"""
    
    def test_numeric_only_adds_r(self):
        """Numeric-only values should receive 'R' suffix"""
        assert harmonize_resistor_value("10") == "10R"
        assert harmonize_resistor_value("100") == "100R"
        assert harmonize_resistor_value("1") == "1R"
    
    def test_lowercase_k_uppercase(self):
        """Lowercase 'k' should be uppercased"""
        assert harmonize_resistor_value("2.2k") == "2.2K"
        assert harmonize_resistor_value("10k") == "10K"
    
    def test_lowercase_m_uppercase(self):
        """Lowercase 'm' should be uppercased"""
        assert harmonize_resistor_value("470m") == "470M"
        assert harmonize_resistor_value("1m") == "1M"
    
    def test_lowercase_r_uppercase(self):
        """Lowercase 'r' should be uppercased"""
        assert harmonize_resistor_value("10r") == "10R"
        assert harmonize_resistor_value("4.7r") == "4.7R"
    
    def test_already_uppercase(self):
        """Already uppercase values should remain unchanged"""
        assert harmonize_resistor_value("2.2K") == "2.2K"
        assert harmonize_resistor_value("10R") == "10R"
        assert harmonize_resistor_value("1M") == "1M"
    
    def test_with_whitespace(self):
        """Values with whitespace should be handled"""
        assert harmonize_resistor_value("  10  ") == "10R"
        assert harmonize_resistor_value("  2.2k  ") == "2.2K"
    
    def test_empty_value(self):
        """Empty/None values should be returned as-is"""
        assert harmonize_resistor_value("") == ""
        assert harmonize_resistor_value(None) is None

    def test_non_numeric_value_not_suffixed(self):
        """Valeurs non ohmiques (NC, DNP...) : laissées intactes, pas de 'R'."""
        assert harmonize_resistor_value("NC") == "NC"
        assert harmonize_resistor_value("DNP") == "DNP"
        assert harmonize_resistor_value("NP") == "NP"
        assert harmonize_resistor_value("  NC  ") == "NC"
        # Le dispatcher doit donner le même résultat pour une résistance.
        assert harmonize_value("NC", "R") == "NC"


class TestHarmonizeCapacitorValue:
    """Test capacitor value harmonization"""
    
    def test_lowercase_nf_uppercase(self):
        """Lowercase 'nf' should become uppercase 'nF'"""
        assert harmonize_capacitor_value("100nf") == "100nF"
        assert harmonize_capacitor_value("47nf") == "47nF"
    
    def test_lowercase_uf_uppercase(self):
        """Lowercase 'uf' should become uppercase 'uF'"""
        assert harmonize_capacitor_value("10uf") == "10uF"
        assert harmonize_capacitor_value("1uf") == "1uF"
    
    def test_lowercase_pf_uppercase(self):
        """Lowercase 'pf' should become uppercase 'pF'"""
        assert harmonize_capacitor_value("1pf") == "1pF"
        assert harmonize_capacitor_value("100pf") == "100pF"
    
    def test_already_uppercase(self):
        """Already uppercase values should remain unchanged"""
        assert harmonize_capacitor_value("100nF") == "100nF"
        assert harmonize_capacitor_value("10uF") == "10uF"
        assert harmonize_capacitor_value("1pF") == "1pF"
    
    def test_mixed_case(self):
        """Mixed case should be standardized to uppercase F"""
        assert harmonize_capacitor_value("100Nf") == "100NF"
        assert harmonize_capacitor_value("10UF") == "10UF"
    
    def test_with_whitespace(self):
        """Values with whitespace should be handled"""
        assert harmonize_capacitor_value("  100nf  ") == "100nF"
        assert harmonize_capacitor_value("100 nf") == "100 nF"

    def test_bare_prefix_gets_f_appended(self):
        """Bare prefix without F (Eagle '100n') should become '100nF' so it
        matches a '100nF' library component (and thus gets a feeder)."""
        assert harmonize_capacitor_value("100n") == "100nF"
        assert harmonize_capacitor_value("1u") == "1uF"
        assert harmonize_capacitor_value("10p") == "10pF"
        assert harmonize_capacitor_value("4.7u") == "4.7uF"
        assert harmonize_capacitor_value("100n/50V") == "100nF/50V"

    def test_bare_prefix_does_not_double_f(self):
        """Already-suffixed values must not get a second F."""
        assert harmonize_capacitor_value("100nF") == "100nF"
        assert harmonize_capacitor_value("4.7uF/50V") == "4.7uF/50V"
        # Notation « 4n7 » (chiffre après préfixe) laissée intacte.
        assert harmonize_capacitor_value("4n7") == "4n7"

    def test_empty_value(self):
        """Empty/None values should be returned as-is"""
        assert harmonize_capacitor_value("") == ""
        assert harmonize_capacitor_value(None) is None


class TestHarmonizeValue:
    """Test master harmonize_value dispatcher function"""
    
    def test_resistor_dispatch(self):
        """Resistor values should use resistor harmonization"""
        assert harmonize_value("10", "R") == "10R"
        assert harmonize_value("2.2k", "R") == "2.2K"
        assert harmonize_value("1m", "R") == "1M"
    
    def test_capacitor_dispatch(self):
        """Capacitor values should use capacitor harmonization"""
        assert harmonize_value("100nf", "C") == "100nF"
        assert harmonize_value("10uf", "C") == "10uF"
        assert harmonize_value("1pf", "C") == "1pF"
    
    def test_unknown_type_passthrough(self):
        """Unknown component types should pass through unchanged"""
        assert harmonize_value("LM335AM", "U") == "LM335AM"
        assert harmonize_value("BZX55C5V1", "D") == "BZX55C5V1"
    
    def test_empty_value(self):
        """Empty values should be handled"""
        assert harmonize_value("", "R") == ""
        assert harmonize_value(None, "C") is None


class TestValidateHarmonizedValue:
    """Test validation of harmonized values"""
    
    def test_valid_resistor_values(self):
        """Valid resistor formats should pass validation"""
        assert validate_harmonized_value("10R", "R") == True
        assert validate_harmonized_value("2.2K", "R") == True
        assert validate_harmonized_value("470M", "R") == True
    
    def test_invalid_resistor_values(self):
        """Invalid resistor formats should fail validation"""
        assert validate_harmonized_value("10", "R") == False  # missing unit
        assert validate_harmonized_value("10ohm", "R") == False  # wrong unit
    
    def test_valid_capacitor_values(self):
        """Valid capacitor formats should pass validation"""
        assert validate_harmonized_value("100nF", "C") == True
        assert validate_harmonized_value("10uF", "C") == True
        assert validate_harmonized_value("1pF", "C") == True
    
    def test_invalid_capacitor_values(self):
        """Invalid capacitor formats should fail validation"""
        assert validate_harmonized_value("100 nf", "C") == False  # lowercase f
        assert validate_harmonized_value("100n", "C") == False  # missing F
    
    def test_empty_value(self):
        """Empty values should fail validation"""
        assert validate_harmonized_value("", "R") == False
        assert validate_harmonized_value(None, "C") == False


class TestHarmonizeBomItems:
    """Test batch harmonization of BOM items"""
    
    def test_batch_harmonize_mixed_components(self):
        """Test harmonizing multiple component types"""
        items = [
            {"reference": "R1", "value_raw": "10", "component_type": "R"},
            {"reference": "C1", "value_raw": "100nf", "component_type": "C"},
            {"reference": "U1", "value_raw": "LM335AM", "component_type": "U"},
        ]
        
        result = harmonize_bom_items(items)
        
        assert len(result) == 3
        assert result[0]["value_harmonized"] == "10R"
        assert result[1]["value_harmonized"] == "100nF"
        assert result[2]["value_harmonized"] == "LM335AM"
    
    def test_batch_preserve_original_fields(self):
        """Test that original fields are preserved during batch harmonization"""
        items = [
            {"reference": "R1", "value_raw": "10", "component_type": "R", "footprint": "0805"},
        ]
        
        result = harmonize_bom_items(items)
        
        assert result[0]["reference"] == "R1"
        assert result[0]["footprint"] == "0805"
        assert result[0]["value_harmonized"] == "10R"
    
    def test_batch_empty_list(self):
        """Test batch harmonization with empty list"""
        result = harmonize_bom_items([])
        assert result == []
    
    def test_batch_missing_component_type(self):
        """Test batch harmonization with missing component_type field"""
        items = [{"reference": "R1", "value_raw": "10"}]
        
        result = harmonize_bom_items(items)
        
        # Should not add value_harmonized if component_type missing
        assert "value_harmonized" not in result[0]


class TestRealWorldExamples:
    """Test with real-world examples from user's BOM"""
    
    def test_resistor_examples(self):
        """Test resistor harmonization with real examples"""
        examples = [
            ("10", "10R"),
            ("2.2k", "2.2K"),
            ("470m", "470M"),
            ("1.5K", "1.5K"),  # already correct
        ]
        
        for input_val, expected in examples:
            assert harmonize_resistor_value(input_val) == expected
    
    def test_capacitor_examples(self):
        """Test capacitor harmonization with real examples"""
        examples = [
            ("100nf", "100nF"),
            ("10uf", "10uF"),
            ("1pf", "1pF"),
            ("22nF", "22nF"),  # already correct
        ]
        
        for input_val, expected in examples:
            assert harmonize_capacitor_value(input_val) == expected
    
    def test_full_bom_workflow(self):
        """Test complete harmonization workflow from parser output"""
        # Simulate output from file_parser.py
        parsed_items = [
            {
                "reference": "R1",
                "value_raw": "10",
                "footprint": "0805",
                "position_x": 10.0,
                "position_y": 20.0,
                "rotation": 0,
                "component_type": "R",
            },
            {
                "reference": "C1",
                "value_raw": "100nf",
                "footprint": "0805",
                "position_x": 15.0,
                "position_y"