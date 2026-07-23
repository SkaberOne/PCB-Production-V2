"""Tests : la commande ne liste/exporte que ce qui reste à commander (2026-07-09).

Le stock réel (``stock_available``) est attaché au résumé de commande ; l'export ERP
calcule ``à commander = besoin − stock`` et exclut les composants couverts.
"""

from src.services.command_service import CommandService
from src.services.command_export_service import CommandExportService


def _rows(lines, overrides=None):
    summary = {"aggregated_components": lines}
    return CommandExportService._build_erp_export_rows(summary, defaults={}, line_overrides=overrides or {})


def test_export_skips_components_covered_by_stock():
    lines = [
        {"key": "A", "quantity": 100, "stock_available": 200, "component_library_id": 1},  # couvert -> exclu
        {"key": "B", "quantity": 100, "stock_available": 30, "component_library_id": 2},   # à commander 70
        {"key": "C", "quantity": 50, "stock_available": None, "component_library_id": 3},  # stock inconnu -> 50
    ]
    rows = _rows(lines)
    qtys = [r["Quantité"] for r in rows]
    assert len(rows) == 2
    assert 70 in qtys and 50 in qtys
    assert 200 not in qtys  # la ligne couverte n'apparait pas


def test_export_respects_manual_override():
    lines = [{"key": "A", "quantity": 100, "stock_available": 200, "component_library_id": 1}]
    # Override manuel > 0 : la ligne réapparait avec la quantité forcée.
    rows = _rows(lines, overrides={"A": 12})
    assert len(rows) == 1 and rows[0]["Quantité"] == 12
    # Override à 0 : exclue.
    assert _rows(lines, overrides={"A": 0}) == []


def test_export_exact_cover_is_excluded():
    lines = [{"key": "A", "quantity": 60, "stock_available": 60, "component_library_id": 1}]
    assert _rows(lines) == []


def test_export_line_offer_override_wins_over_global():
    """Feature B : l'offre du fournisseur choisi par ligne prime sur le meilleur global."""
    lines = [{"key": "A", "quantity": 100, "stock_available": 0, "component_library_id": 1}]
    global_offers = {1: {"supplier": "MOUSER", "supplier_part": "M-123", "product_url": "http://m"}}
    line_override = {"A": {"supplier": "RS", "supplier_part": "RS-999", "product_url": "http://rs"}}
    rows = CommandExportService._build_erp_export_rows(
        {"aggregated_components": lines},
        defaults={},
        offers_by_component=global_offers,
        line_overrides=None,
        line_offer_override=line_override,
    )
    assert len(rows) == 1
    assert rows[0]["Référence fournisseur"] == "RS-999"
    assert rows[0]["Fournisseur"] == "RS"
    assert rows[0]["Lien web"] == "http://rs"
