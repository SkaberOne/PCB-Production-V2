"""T-005 — le nom par défaut de la commande implicite dérive du nom de la production."""

from src.services.production_command_service import ProductionCommandService


class _StubProduction:
    def __init__(self, name):
        self.name = name


def test_implicit_name_uses_production_name():
    prod = _StubProduction("TEST_AUDIT KT220430F 06/2026")
    assert (
        ProductionCommandService._implicit_name(3, prod)
        == "Commande TEST_AUDIT KT220430F 06/2026"
    )


def test_implicit_name_falls_back_without_production():
    assert ProductionCommandService._implicit_name(7, None) == "Commande prod 7"


def test_implicit_name_falls_back_on_blank_name():
    assert (
        ProductionCommandService._implicit_name(9, _StubProduction("   "))
        == "Commande prod 9"
    )
