"""Tests de parité — optimisations N+1 (prompt 015).

Vérifie que les chemins optimisés donnent les MÊMES résultats :
  - ``can_i_produce`` avec contexte préchargé (``ctx``) == sans contexte ;
  - le résumé dashboard agrège correctement plusieurs productions (cartes
    produites via GROUP BY, cible, dernière commande).
"""
from src.models.bom import Component
from src.models.commands import Command
from src.models.production import Production, ProductionRun
from src.models.stock import ComponentStock
from src.services.component_library_service import ComponentLibraryService
from src.services.production_stock_service import ProductionStockService
from src.services.report_service import ReportService
from src.services.stock_service import StockService

from .conftest import TestingSessionLocal
from .test_production_stock import _component, _production


def _build_ctx(db):
    allc = db.query(Component).all()
    return {
        "settings": StockService.get_settings(db),
        "components": {c.id: c for c in allc},
        "lookup": ComponentLibraryService.build_lookup(allc),
        "stocks": {s.component_id: s for s in db.query(ComponentStock).all()},
        "engaged": StockService.engaged_by_component(db),
    }


def test_can_i_produce_ctx_parity():
    db = TestingSessionLocal()
    _component(db, "10k", "R0402")
    db.commit()
    prod = _production(db, "PP", [("TOP", [("10k", "R0402", 2, False)])])

    res_default = ProductionStockService.can_i_produce(db, prod.id, None)
    res_ctx = ProductionStockService.can_i_produce(db, prod.id, None, ctx=_build_ctx(db))

    assert res_default == res_ctx
    db.close()


def test_dashboard_summary_aggregates_multiple_productions():
    db = TestingSessionLocal()
    _component(db, "10k", "R0402")
    db.commit()
    p1 = _production(db, "D1", [("TOP", [("10k", "R0402", 1, False)])], qty=10)
    p2 = _production(db, "D2", [("TOP", [("10k", "R0402", 1, False)])], qty=5)
    # 2 runs (non annulés) sur p1 → 3 + 4 = 7 cartes produites ; 0 sur p2.
    db.add(ProductionRun(production_id=p1.id, boards_produced=3))
    db.add(ProductionRun(production_id=p1.id, boards_produced=4))
    db.add(ProductionRun(production_id=p1.id, boards_produced=99, is_cancelled=True))
    db.add(Command(name="C1", production_id=p1.id))
    db.commit()

    summaries = ReportService.get_productions_summary(db)
    by_id = {s["id"]: s for s in summaries}

    assert set(by_id) == {p1.id, p2.id}
    assert by_id[p1.id]["boards_produced"] == 7   # annulé exclu
    assert by_id[p1.id]["boards_target"] == 10
    assert by_id[p2.id]["boards_produced"] == 0
    assert by_id[p2.id]["boards_target"] == 5
    assert by_id[p1.id]["command"] is not None
    assert by_id[p2.id]["command"] is None
    db.close()
