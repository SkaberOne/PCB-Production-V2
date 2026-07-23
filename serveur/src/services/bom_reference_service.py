"""Suppression d'une carte (BomReference) — unitaire + bulk (prompt 020).

Refuse (409) si la carte est liée à une production, du stock cartes (qté > 0),
une commande, un assemblage (sous-carte) ou un modèle machine. Sinon suppression
transactionnelle de toutes les tables enfant (aucun orphelin — cf. leçon
``delete_production``, FK SQL Server).
"""

from typing import Dict, List

from sqlalchemy.orm import Session

from ..models.bom import AssemblyItem, BomItem, BomReference, BomRevision
from ..models.board_stock import BoardStock, ClientOrderLine, MachineModelCard
from ..models.commands import CommandItem
from ..models.costing import ProductionCosting
from ..models.production import ProductionBomRevision
from .bom_file_service import BomFileService


bom_file_service = BomFileService()


class ReferenceLinkedError(Exception):
    """La carte ne peut être supprimée : elle est encore liée (raisons listées)."""

    def __init__(self, reference: str, reasons: List[str]):
        self.reference = reference
        self.reasons = reasons
        super().__init__(f"{reference} liée à : {', '.join(reasons)}")


def _link_reasons(db: Session, ref: BomReference, rev_ids: List[int]) -> List[str]:
    reasons: List[str] = []
    if rev_ids and db.query(ProductionBomRevision.id).filter(
        ProductionBomRevision.bom_revision_id.in_(rev_ids)
    ).first():
        reasons.append("une production")
    if db.query(BoardStock.id).filter(
        BoardStock.bom_reference_id == ref.id, BoardStock.qty_in_stock > 0
    ).first():
        reasons.append("du stock cartes (quantité > 0)")
    ordered = (
        rev_ids and db.query(CommandItem.id).filter(CommandItem.bom_revision_id.in_(rev_ids)).first()
    ) or db.query(ClientOrderLine.id).filter(ClientOrderLine.bom_reference_id == ref.id).first()
    if ordered:
        reasons.append("une commande")
    if db.query(AssemblyItem.id).filter(AssemblyItem.child_reference_id == ref.id).first():
        reasons.append("un assemblage (sous-carte)")
    if db.query(MachineModelCard.id).filter(MachineModelCard.bom_reference_id == ref.id).first():
        reasons.append("un modèle machine")
    return reasons


def delete_reference(db: Session, bom_reference_id: int) -> Dict:
    """Supprime une carte non liée (sinon lève ``ReferenceLinkedError``)."""
    ref = db.query(BomReference).filter(BomReference.id == bom_reference_id).first()
    if not ref:
        raise ValueError(f"Carte {bom_reference_id} introuvable")

    reference_name = ref.reference
    revisions = list(ref.revisions or [])
    rev_ids = [r.id for r in revisions]

    reasons = _link_reasons(db, ref, rev_ids)
    if reasons:
        raise ReferenceLinkedError(reference_name, reasons)

    # Snapshots fichiers à purger après commit (best-effort, filesystem).
    snapshots = [
        (reference_name, rev.revision, item.placement_side)
        for rev in revisions
        for item in (rev.items or [])
        if getattr(item, "placement_side", None)
    ]

    # Suppression enfants d'abord (bulk, FK-safe SQL Server) puis la carte.
    if rev_ids:
        db.query(BomItem).filter(BomItem.bom_revision_id.in_(rev_ids)).delete(synchronize_session=False)
    db.query(BomRevision).filter(BomRevision.bom_ref_id == ref.id).delete(synchronize_session=False)
    db.query(BoardStock).filter(BoardStock.bom_reference_id == ref.id).delete(synchronize_session=False)
    db.query(ProductionCosting).filter(ProductionCosting.bom_reference_id == ref.id).delete(synchronize_session=False)
    db.query(AssemblyItem).filter(AssemblyItem.parent_reference_id == ref.id).delete(synchronize_session=False)
    db.query(BomReference).filter(BomReference.id == ref.id).delete(synchronize_session=False)
    db.commit()

    for r, rv, side in snapshots:
        try:
            bom_file_service.delete_revision_snapshot(r, rv, side)
        except Exception:  # noqa: BLE001 — nettoyage fichier best-effort
            pass

    return {"deleted": True, "id": bom_reference_id, "reference": reference_name}


def delete_references_bulk(db: Session, ids: List[int]) -> Dict:
    """Supprime plusieurs cartes ; renvoie un rapport (supprimées / ignorées)."""
    deleted: List[Dict] = []
    skipped: List[Dict] = []
    for rid in ids:
        try:
            res = delete_reference(db, rid)
            deleted.append({"id": rid, "reference": res["reference"]})
        except ReferenceLinkedError as exc:
            skipped.append({"id": rid, "reference": exc.reference, "reasons": exc.reasons})
        except ValueError:
            skipped.append({"id": rid, "reference": None, "reasons": ["introuvable"]})
    return {"deleted": deleted, "skipped": skipped}
