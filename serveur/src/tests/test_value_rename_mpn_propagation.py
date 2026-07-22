"""Propagation du renommage de valeur → composant / MPN (prompt 002, échange E01).

La résolution composant (donc MPN, offre, feeder, placement) passe par
``ComponentLibraryService.match_bom_item`` — utilisé par la commande, le PnP,
le costing et le stock. E01 (option A) : préférer la **valeur harmonisée** ;
la brute n'est qu'un **repli** si l'harmonisée est absente. Une valeur renommée
vers un composant inconnu → **sans MPN**, jamais l'ancien.

Ces tests unitaires couvrent le mécanisme partagé (donc commande ET PnP). Les
suites d'intégration existantes (test_command_*, test_pnp_export,
test_assignment_*, test_costing, test_*stock) sont relancées pour la
non-régression (blast radius E01).
"""

from src.models.bom import BomItem, Component
from src.services.component_library_service import ComponentLibraryService as CLS

FP = "C0805"


def _comp(reference, value, mpn):
    return Component(
        reference=reference, value=value, mpn=mpn,
        footprint_pnp=FP, footprint_eagle=FP, package=FP,
    )


def _lookup():
    old = _comp("LIB-OLD", "10µF", "OLD-MPN")
    new = _comp("LIB-NEW", "10µF/35V", "NEW-MPN")
    return CLS.build_lookup([old, new])


def _item(value_raw, value_harmonized):
    return BomItem(
        reference_item="C1", value_raw=value_raw, value_harmonized=value_harmonized,
        footprint_pnp=FP, footprint_eagle=FP,
    )


def test_rename_matches_harmonized_new_component():
    # Renommage 10µF -> 10µF/35V : la commande/PnP doit pointer le NOUVEAU MPN.
    matched = CLS.match_bom_item(_lookup(), _item("10µF", "10µF/35V"))
    assert matched is not None
    assert matched.mpn == "NEW-MPN"


def test_rename_to_unknown_value_yields_no_mpn_never_old():
    # Nouvelle valeur absente de la bibliothèque -> sans MPN, JAMAIS l'ancien
    # (pas de repli sur value_raw qui matcherait encore l'ancien composant).
    matched = CLS.match_bom_item(_lookup(), _item("10µF", "99nF/99V"))
    assert matched is None


def test_empty_harmonized_falls_back_to_raw():
    # Repli : sans valeur harmonisée, on utilise la brute (rétro-compat).
    matched = CLS.match_bom_item(_lookup(), _item("10µF", None))
    assert matched is not None
    assert matched.mpn == "OLD-MPN"


def test_harmonized_equals_raw_still_matches():
    matched = CLS.match_bom_item(_lookup(), _item("10µF", "10µF"))
    assert matched is not None
    assert matched.mpn == "OLD-MPN"


def test_item_payload_variant_prefers_harmonized():
    matched = CLS.match_item_payload(_lookup(), {
        "value_raw": "10µF", "value_harmonized": "10µF/35V",
        "footprint_pnp": FP, "footprint_eagle": FP,
    })
    assert matched is not None
    assert matched.mpn == "NEW-MPN"
