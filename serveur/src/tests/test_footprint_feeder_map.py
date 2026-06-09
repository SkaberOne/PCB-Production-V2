"""Tests du mapping footprint -> largeur de bande feeder (EIA-481 / catalogue interne)."""

import pytest

from src.utils.footprint_feeder_map import (
    deduce_feeder_size_mm,
    deduce_feeder_type_from_footprint,
)


@pytest.mark.parametrize(
    "footprint,expected_mm",
    [
        # petits (<=8mm => 1 position)
        ("SOT-23-3", 8),
        ("TSOT-23", 8),
        ("SOT-323", 8),
        ("SOT-363", 8),
        ("SC-59", 8),
        ("SOT-65-6", 8),
        ("DFN2020-8", 8),
        ("DFN-12", 8),       # aligné catalogue (DFN-6/8/10 = 8mm)
        ("TDFN-12", 8),
        ("0805", 8),
        ("1206", 8),
        ("2616", 8),
        ("0806", 8),
        # gros (>8mm => 2 positions)
        ("DO-214AA", 12),    # SMB
        ("DO-214AC", 12),    # SMA
        ("DO-214AB", 16),    # SMC
        ("SMC_D", 16),
        ("PANASONIC_C", 12),
        ("PANASONIC_D", 12),
        ("PANASONIC_E", 16),
        ("QSOP-16", 12),
        ("MSOP-8", 12),
        ("TSSOP-10", 12),
        ("SOIC-4", 12),
        ("SOT-223", 12),
        ("QFN", 12),
        ("SOT-65-28", 12),   # SSOP-28
        ("PowerPAK SO-8", 12),
        ("POWERPAK 1212-8", 16),
        ("SOT-669", 12),
        ("TO-277", 12),
        ("DPAK", 16),
        ("TO-263-5", 16),    # D2PAK
        ("SOP-64", 24),
        ("TQ100", 16),       # TQFP-100
    ],
)
def test_known_footprints_map_to_expected_width(footprint, expected_mm):
    assert deduce_feeder_size_mm(footprint) == expected_mm


@pytest.mark.parametrize(
    "eagle,expected_mm",
    [
        ("IND_IHLP-2020CZ-8A_VIS", 12),
        ("SPM10054-HZ", 16),
        ("SRU1208", 16),
        ("SRN3015C100M", 8),
        ("INDPM102100X400N", 16),
        ("744066", 16),
    ],
)
def test_inductor_mpn_via_eagle_field(eagle, expected_mm):
    # footprint_pnp inexploitable, déduction via le champ footprint_eagle (MPN)
    assert deduce_feeder_size_mm(None, eagle, None) == expected_mm


@pytest.mark.parametrize(
    "footprint",
    [
        "CONNECTEUR",
        "TO-220",
        "TO-220-5",
        "DIP-8",
        "TFM-140-02-L-D-A",
        "TSM-122-04-T-DV",
        "FUSE-SMD",
        "IHLP",       # taille inconnue sans variante
        "????",
        "AD9116",
    ],
)
def test_unidentifiable_footprints_stay_manual(footprint):
    assert deduce_feeder_size_mm(footprint) is None
    assert deduce_feeder_type_from_footprint(footprint) is None


def test_returns_canonical_cl_labels():
    assert deduce_feeder_type_from_footprint("SOT-23-3") == "CL8-4"
    assert deduce_feeder_type_from_footprint("DO-214AB") == "CL16"
    assert deduce_feeder_type_from_footprint("QSOP-16") == "CL12"


def test_pnp_priority_then_eagle_fallback():
    # footprint_pnp prioritaire quand exploitable
    assert deduce_feeder_size_mm("SMC_D", "SMB", None) == 16
    # sinon repli sur eagle
    assert deduce_feeder_size_mm("SMD", "IND_VCHA075D_CYN-M", None) == 12
