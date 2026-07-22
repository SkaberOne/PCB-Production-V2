"""Suivi préparé / installé par (production, composant) — prompt 007.

Annotation d'avancement sans impact sur le solde de stock :
- endpoint toggle PUT /api/marketplace/productions/{id}/component-progress/{cid}
  (set-to, renseigne qui + quand via header X-Workstation, idempotent, unicité) ;
- exposition du conditionnement (qty_reel/bag/tube) + de l'état via les services
  d'enrichissement réutilisés par les vues Commande et Machine PnP.
"""

from src.models.bom import Component
from src.models.production import Production, ProductionComponentProgress
from src.services.production_progress_service import ProductionProgressService
from src.services.stock_service import StockService

from .conftest import TestingSessionLocal, client

WS = {"X-Workstation": "POSTE-A"}


def _make_component(db, value="10K", footprint="R0402"):
    comp = Component(
        reference=f"LIB-{value}-{footprint}",
        value=value,
        mpn=f"MPN-{value}",
        footprint_eagle=footprint,
        footprint_pnp=footprint,
        component_type="RESISTOR",
    )
    db.add(comp)
    db.commit()
    db.refresh(comp)
    return comp


def _make_production(db, name):
    p = Production(name=name, status=Production.StatusEnum.ACTIVE)
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


def _setup():
    db = TestingSessionLocal()
    comp = _make_component(db)
    prod = _make_production(db, "PROG-1")
    StockService.post_declaration(db, comp.id, qty_reel=10, qty_bag=5, qty_tube=2)
    pid, cid = prod.id, comp.id
    db.close()
    return pid, cid


# -------------------------------------------------- endpoint toggle
def test_toggle_prepared_sets_who_and_when():
    pid, cid = _setup()
    res = client.put(
        f"/api/marketplace/productions/{pid}/component-progress/{cid}",
        json={"prepared": True},
        headers=WS,
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["is_prepared"] is True
    assert body["prepared_by"] == "POSTE-A"
    assert body["prepared_at"] is not None
    assert body["is_installed"] is False


def test_toggle_installed_independent_of_prepared():
    pid, cid = _setup()
    client.put(
        f"/api/marketplace/productions/{pid}/component-progress/{cid}",
        json={"prepared": True}, headers=WS,
    )
    res = client.put(
        f"/api/marketplace/productions/{pid}/component-progress/{cid}",
        json={"installed": True}, headers={"X-Workstation": "POSTE-B"},
    )
    body = res.json()
    assert body["is_prepared"] is True          # conservé (set-to partiel)
    assert body["is_installed"] is True
    assert body["installed_by"] == "POSTE-B"


def test_untick_clears_who_and_when():
    pid, cid = _setup()
    client.put(
        f"/api/marketplace/productions/{pid}/component-progress/{cid}",
        json={"prepared": True}, headers=WS,
    )
    res = client.put(
        f"/api/marketplace/productions/{pid}/component-progress/{cid}",
        json={"prepared": False}, headers=WS,
    )
    body = res.json()
    assert body["is_prepared"] is False
    assert body["prepared_by"] is None
    assert body["prepared_at"] is None


def test_toggle_is_idempotent_and_unique_per_pair():
    pid, cid = _setup()
    for _ in range(3):
        client.put(
            f"/api/marketplace/productions/{pid}/component-progress/{cid}",
            json={"prepared": True}, headers=WS,
        )
    db = TestingSessionLocal()
    rows = (
        db.query(ProductionComponentProgress)
        .filter(
            ProductionComponentProgress.production_id == pid,
            ProductionComponentProgress.component_id == cid,
        )
        .all()
    )
    db.close()
    assert len(rows) == 1  # unicité (production, composant)


def test_unknown_production_404():
    res = client.put(
        "/api/marketplace/productions/999999/component-progress/1",
        json={"prepared": True}, headers=WS,
    )
    assert res.status_code == 404


# -------------------------------------------------- exposition conditionnement / état
def test_conditionnement_map_reports_breakdown():
    pid, cid = _setup()
    cond = ProductionProgressService.conditionnement_map(TestingSessionLocal(), [cid])
    assert cond[cid] == {"reel": 10, "bag": 5, "tube": 2}


def test_enrich_tree_decorates_component_id_nodes():
    pid, cid = _setup()
    client.put(
        f"/api/marketplace/productions/{pid}/component-progress/{cid}",
        json={"installed": True}, headers=WS,
    )
    tree = {
        "slot_assignments": [{"component_id": cid, "slot": 3}],
        "manual_placement_components": [{"component_id": cid}],
        "noise": {"nested": [{"component_id": cid}]},
    }
    db = TestingSessionLocal()
    ProductionProgressService.enrich_component_id_tree(db, pid, tree)
    db.close()
    node = tree["slot_assignments"][0]
    assert node["conditionnement"] == {"reel": 10, "bag": 5, "tube": 2}
    assert node["progress"]["is_installed"] is True
    assert tree["noise"]["nested"][0]["progress"]["is_installed"] is True
