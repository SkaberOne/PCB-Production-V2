"""Le libellé de la table machine affiche la valeur d'abord (10k, 100nF),
et retombe sur le MPN pour les composants sans valeur (transistors, LED…)."""
from types import SimpleNamespace

from src.services.assignment_helpers import (
    component_value_label,
    component_display_label,
)


def _comp(value=None, mpn=None, description=None, reference=None):
    return SimpleNamespace(
        value=value, mpn=mpn, description=description, reference=reference
    )


def test_value_label_prefers_value_over_mpn():
    c = _comp(value="10k", mpn="CRCW040210K0FKED", description="Resistor")
    assert component_value_label(c) == "10k"


def test_value_label_falls_back_to_mpn_when_no_value():
    c = _comp(value=None, mpn="MMBT3904", description="NPN transistor")
    assert component_value_label(c) == "MMBT3904"


def test_value_label_falls_back_to_description_then_reference():
    assert component_value_label(_comp(description="desc")) == "desc"
    assert component_value_label(_comp(reference="R12")) == "R12"
    assert component_value_label(None) == "Composant inconnu"


def test_display_label_unchanged_prefers_description_then_mpn():
    # Le helper de tri ne doit PAS avoir changé (MPN avant valeur).
    c = _comp(value="10k", mpn="CRCW040210K0FKED")
    assert component_display_label(c) == "CRCW040210K0FKED"
