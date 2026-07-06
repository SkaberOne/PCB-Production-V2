"""Tests for component deletion (duplicate cleanup) — DELETE /api/bom/components/{id}.

Covers: clean delete when unreferenced, 409 block + reference report when the
component is used (stock + movements), and force=true cascade that removes the
linked rows then the component.
"""

from .conftest import client, TestingSessionLocal

from src.models.bom import Component
from src.models.stock import ComponentStock, StockMovement
from src.services.stock_service import StockService


def _make_component(db, value="LM358D", mpn=None, ctype="IC"):
    comp = Component(reference=f"LIB-{value}", value=value, mpn=mpn, component_type=ctype)
    db.add(comp)
    db.commit()
    db.refresh(comp)
    return comp


def test_delete_unreferenced_component_ok():
    db = TestingSessionLocal()
    comp = _make_component(db)
    comp_id = comp.id
    db.close()

    res = client.delete(f"/api/bom/components/{comp_id}")
    assert res.status_code == 200
    body = res.json()
    assert body["deleted"] is True
    assert body["component_id"] == comp_id

    # Le composant a disparu.
    assert client.get(f"/api/bom/components/{comp_id}").status_code == 404


def test_delete_missing_component_404():
    assert client.delete("/api/bom/components/999999").status_code == 404


def test_delete_referenced_component_blocked_then_force():
    db = TestingSessionLocal()
    comp = _make_component(db, value="100nF", ctype="CAPACITOR")
    comp_id = comp.id
    # Crée une référence : stock + mouvement.
    StockService.post_declaration(db, comp_id, qty_reel=5)
    db.close()

    # Sans force -> 409 avec le détail des usages.
    blocked = client.delete(f"/api/bom/components/{comp_id}")
    assert blocked.status_code == 409
    detail = blocked.json()["detail"]
    assert "references" in detail
    assert detail["references"].get("stock", 0) >= 1
    assert detail["references"].get("movements", 0) >= 1

    # Le composant est toujours là.
    assert client.get(f"/api/bom/components/{comp_id}").status_code == 200

    # Avec force -> suppression + cascade.
    forced = client.delete(f"/api/bom/components/{comp_id}", params={"force": True})
    assert forced.status_code == 200
    assert forced.json()["cascaded"].get("stock", 0) >= 1

    # Composant et données liées supprimés.
    assert client.get(f"/api/bom/components/{comp_id}").status_code == 404
    verify = TestingSessionLocal()
    assert verify.query(ComponentStock).filter(ComponentStock.component_id == comp_id).count() == 0
    assert verify.query(StockMovement).filter(StockMovement.component_id == comp_id).count() == 0
    verify.close()
