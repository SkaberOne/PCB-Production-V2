"""Propagation du changement de footprint -> composant / MPN (prompt 005).

Parite avec le renommage de valeur (002) : la resolution composant (donc MPN,
offre, feeder, placement) passe par ``ComponentLibraryService.match_bom_item``,
deja indexe sur ``(valeur, footprint)`` avec ``footprint_candidates =
[footprint_pnp, footprint_eagle]``. Changer le footprint PnP d'une ligne fait
donc suivre le MPN du composant ``(valeur, nouveau footprint)`` s'il existe en
bibliotheque ; sinon **sans MPN** (a enrichir), jamais l'ancien.

Aucun changement backend : ces tests verrouillent le mecanisme partage (commande,
PnP, costing, stock) pour le cas footprint.
"""

from src.models.bom import BomItem, Component
from src.services.component_library_service import ComponentLibraryService as CLS

VALUE = "4.7k"
# footprint_eagle neutre cote ligne : seul le footprint_pnp (edite) doit piloter.
NEUTRAL_EAGLE = "R_EAGLE_X"


def _comp(reference, footprint, mpn):
    return Component(
        reference=reference, value=VALUE, mpn=mpn,
        footprint_pnp=footprint, footprint_eagle=footprint, package=footprint,
    )


def _lookup():
    # Meme valeur, deux footprints -> deux composants (donc deux MPN) distincts.
    c0603 = _comp("LIB-0603", "0603", "MPN-0603")
    c1206 = _comp("LIB-1206", "1206", "MPN-1206")
    return CLS.build_lookup([c0603, c1206])


def _item(footprint_pnp):
    return BomItem(
        reference_item="R1", value_raw=VALUE, value_harmonized=VALUE,
        footprint_pnp=footprint_pnp, footprint_eagle=NEUTRAL_EAGLE,
    )


def test_footprint_change_follows_new_component_mpn():
    # 4.7k passe de 1206 a 0603 -> la commande doit pointer le MPN du 4.7k 0603.
    matched = CLS.match_bom_item(_lookup(), _item("0603"))
    assert matched is not None
    assert matched.mpn == "MPN-0603"


def test_footprint_other_value_untouched():
    # L'autre footprint reste resolu vers son propre composant/MPN.
    matched = CLS.match_bom_item(_lookup(), _item("1206"))
    assert matched is not None
    assert matched.mpn == "MPN-1206"


def test_footprint_absent_from_library_yields_no_mpn():
    # (valeur, nouveau footprint) absent -> sans MPN (jamais l'ancien).
    matched = CLS.match_bom_item(_lookup(), _item("0402"))
    assert matched is None


def test_footprint_change_via_item_payload_variant():
    matched = CLS.match_item_payload(_lookup(), {
        "value_raw": VALUE, "value_harmonized": VALUE,
        "footprint_pnp": "0603", "footprint_eagle": NEUTRAL_EAGLE,
    })
    assert matched is not None
    assert matched.mpn == "MPN-0603"
