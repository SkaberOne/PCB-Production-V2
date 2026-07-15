"""Mouvements récents + annulation réversible (feature « annuler/modifier »).

Couvre ``GET /api/marketplace/stock/movements/recent`` et
``POST /api/marketplace/stock/movements/{id}/cancel``.
"""

from src.models.bom import Component

from .conftest import TestingSessionLocal, client


def _make_component(db, mpn="RECENT-1", value="10K"):
    comp = Component(
        reference=f"LIB-{mpn}",
        value=value,
        mpn=mpn,
        footprint_eagle="R0402",
        footprint_pnp="R0402",
        component_type="RESISTOR",
    )
    db.add(comp)
    db.commit()
    db.refresh(comp)
    return comp


def _receive(component_id, qty):
    return client.post(
        "/api/marketplace/stock/receptions",
        json={"component_id": component_id, "qty": qty},
    )


def test_recent_lists_receptions_with_component_label():
    db = TestingSessionLocal()
    comp = _make_component(db, mpn="REC-A", value="4K7")
    cid = comp.id
    db.close()
    assert _receive(cid, 300).status_code == 200

    res = client.get("/api/marketplace/stock/movements/recent")
    assert res.status_code == 200
    rows = res.json()
    assert len(rows) >= 1
    top = rows[0]
    assert top["component_id"] == cid
    assert top["mpn"] == "REC-A"
    assert top["value"] == "4K7"
    assert top["qty"] == 300
    assert top["signed_qty"] == 300  # IN → positif
    assert top["motif"] == "reception"
    assert isinstance(top["id"], int)


def test_recent_excludes_cancelled_movement():
    db = TestingSessionLocal()
    comp = _make_component(db, mpn="REC-B")
    cid = comp.id
    db.close()
    _receive(cid, 100)
    mv_id = client.get("/api/marketplace/stock/movements/recent").json()[0]["id"]

    # Annulation réversible.
    cancel = client.post(f"/api/marketplace/stock/movements/{mv_id}/cancel")
    assert cancel.status_code == 200

    # Le mouvement annulé n'apparaît plus dans la liste active.
    rows = client.get("/api/marketplace/stock/movements/recent").json()
    assert all(r["id"] != mv_id for r in rows)

    # Et le stock est revenu à zéro (IN annulé).
    stock = client.get(f"/api/marketplace/stock/{cid}").json()
    assert stock["qty_pieces"] == 0


def test_cancel_unknown_movement_404():
    res = client.post("/api/marketplace/stock/movements/999999/cancel")
    assert res.status_code == 404


def test_recent_limit_param():
    db = TestingSessionLocal()
    comp = _make_component(db, mpn="REC-C")
    cid = comp.id
    db.close()
    for _ in range(3):
        _receive(cid, 10)
    rows = client.get("/api/marketplace/stock/movements/recent?limit=2").json()
    assert len(rows) == 2
