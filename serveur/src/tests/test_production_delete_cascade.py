"""T-009 — la suppression d'une production purge ses tables enfant sans cascade.

Avant correctif, supprimer une production passée par Prix carte / Machine PnP levait
une IntegrityError FK sur SQL Server (``PRODUCTION_COST_INPUT`` etc.). Invisible en
SQLite (FK non appliquées), d'où ce test sur le comportement du service : les lignes
1:1 sont supprimées, l'historique de prix (``PRODUCTION_COSTING``) est détaché.
"""
from src.tests.conftest import TestingSessionLocal
from src.models.bom import BomReference
from src.models.production import Production
from src.models.costing import ProductionCostInput, ProductionCosting
from src.services.production_workspace_service import ProductionWorkspaceService


def test_delete_production_purges_costing_children():
    db = TestingSessionLocal()
    try:
        ref = BomReference(reference="CARD_T009_DELETE")
        db.add(ref)
        prod = Production(name="prod-t009-delete")
        db.add(prod)
        db.commit()
        db.refresh(ref)
        db.refresh(prod)
        prod_id = prod.id

        db.add(ProductionCostInput(production_id=prod_id, pcb_total_price=100.0))
        snap = ProductionCosting(
            bom_reference_id=ref.id, production_id=prod_id, unit_cost_ht=1.0
        )
        db.add(snap)
        db.commit()
        snap_id = snap.id

        # Ne doit pas lever (avant : IntegrityError FK sur SQL Server).
        ProductionWorkspaceService.delete_production(db, prod_id)

        # Production supprimée.
        assert db.query(Production).filter(Production.id == prod_id).first() is None
        # Inputs de coût (1:1) purgés.
        assert (
            db.query(ProductionCostInput)
            .filter(ProductionCostInput.production_id == prod_id)
            .count()
            == 0
        )
        # Snapshot de prix conservé (historique) mais détaché de la production.
        kept = db.query(ProductionCosting).filter(ProductionCosting.id == snap_id).first()
        assert kept is not None
        assert kept.production_id is None
    finally:
        db.close()
