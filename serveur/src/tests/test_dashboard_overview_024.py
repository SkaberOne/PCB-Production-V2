"""Tests prompt 024 — endpoint /reports/dashboard-overview (vue d'ensemble globale).

Vérifie les agrégats (catalogue, stock avec/sans prix + alerte sous-min +
à débugger, productions non terminées, commandes clients à préparer, machines)
et la stabilité sur base vide (zéros, pas d'erreur).
"""
from src.tests.conftest import client, TestingSessionLocal
from src.models.bom import BomReference, BomRevision
from src.models.board_stock import BoardStock, ClientOrder, MachineModel
from src.models.production import Production


def _card(db, reference, qty, min_stock=0, price=None, debug=0):
    ref = BomReference(reference=reference)
    db.add(ref)
    db.flush()
    db.add(BomRevision(bom_ref_id=ref.id, revision="REV_A", type="TOP"))
    db.flush()
    db.add(BoardStock(
        bom_reference_id=ref.id, revision="REV_A",
        qty_in_stock=qty, min_stock=min_stock,
        unit_price_override=price, cards_to_debug=debug,
    ))
    db.commit()
    return ref


def test_dashboard_overview_empty_returns_zeros():
    resp = client.get("/api/reports/dashboard-overview")
    assert resp.status_code == 200
    b = resp.json()
    assert b["catalogue"] == {"references": 0, "revisions": 0}
    assert b["stock"]["cartes_en_stock"] == 0
    assert b["stock"]["a_prix"] is False
    assert b["stock_bas"] == 0
    assert b["productions_en_cours"]["total"] == 0
    assert b["commandes_clients_a_preparer"]["total"] == 0
    assert b["cartes_a_debugger"] == 0
    assert b["machines"] == 0


def test_dashboard_overview_aggregates():
    db = TestingSessionLocal()
    try:
        _card(db, "CARD-1", qty=10, min_stock=0, price=5.0, debug=2)   # en stock, valeur 50
        _card(db, "CARD-2", qty=1, min_stock=5, price=None, debug=0)   # sous le minimum, sans prix
        _card(db, "CARD-3", qty=0, min_stock=0, price=None, debug=0)   # pas de stock
        # Productions : 1 DRAFT + 1 ACTIVE (en cours) + 1 COMPLETED (exclue).
        db.add(Production(name="P-DRAFT", status=Production.StatusEnum.DRAFT))
        db.add(Production(name="P-ACTIVE", status=Production.StatusEnum.ACTIVE))
        db.add(Production(name="P-DONE", status=Production.StatusEnum.COMPLETED))
        # Commandes clients : OPEN + READY (à préparer) + DELIVERED (exclue).
        db.add(ClientOrder(reference="CO-OPEN", status="OPEN"))
        db.add(ClientOrder(reference="CO-READY", status="READY"))
        db.add(ClientOrder(reference="CO-DONE", status="DELIVERED"))
        db.add(MachineModel(name="Modele X"))
        db.commit()
    finally:
        db.close()

    b = client.get("/api/reports/dashboard-overview").json()
    assert b["catalogue"] == {"references": 3, "revisions": 3}
    assert b["stock"]["cartes_en_stock"] == 11          # 10 + 1 + 0
    assert b["stock"]["references_distinctes"] == 2      # CARD-1, CARD-2 (qty > 0)
    assert b["stock"]["valeur"] == 50.0                 # 10 * 5.0
    assert b["stock"]["a_prix"] is True
    assert b["stock_bas"] == 1                           # CARD-2 (1 < 5)
    assert b["cartes_a_debugger"] == 2                   # CARD-1
    assert b["productions_en_cours"] == {"total": 2, "active": 1, "draft": 1}
    assert b["commandes_clients_a_preparer"] == {"total": 2, "open": 1, "ready": 1}
    assert b["machines"] == 1
