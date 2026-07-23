"""Suppression d'une carte (BomReference) — unitaire + bulk (prompts 020, 023).

Refuse (409) si la carte est liée à une production, du stock cartes (qté > 0),
une commande interne (``COMMANDS``) ou client (``CLIENT_ORDERS``), un assemblage
(sous-carte) ou un modèle machine. Le refus **nomme** chaque bloqueur (023 :
nature + identifiant + statut). Un lien **orphelin** (parent supprimé) ne bloque
plus (les checks joignent le parent → les enfants sans parent sont ignorés).
Sinon suppression transactionnelle de toutes les tables enfant (aucun orphelin).
"""

from typing import Dict, List

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models.bom import AssemblyItem, BomItem, BomReference, BomRevision
from ..models.board_stock import (
    BoardStock,
    ClientOrder,
    ClientOrderLine,
    MachineModel,
    MachineModelCard,
)
from ..models.commands import Command, CommandItem
from ..models.costing import ProductionCosting
from ..models.production import Production, ProductionBomRevision
from .bom_file_service import BomFileService


bom_file_service = BomFileService()


def _status_value(status) -> str:
    """Valeur lisible d'un statut (Enum ou str)."""
    return str(getattr(status, "value", status) or "")


class ReferenceLinkedError(Exception):
    """La carte ne peut être supprimée : elle est encore liée (bloqueurs listés)."""

    def __init__(self, reference: str, reasons: List[str], links: List[Dict] = None):
        self.reference = reference
        self.reasons = reasons
        self.links = links or []
        super().__init__(f"{reference} liée à : {', '.join(reasons)}")


def _link_details(db: Session, ref: BomReference, rev_ids: List[int]) -> List[Dict]:
    """Liste structurée des bloqueurs (nature + identifiant + statut + libellé).

    Les checks « commande » joignent le parent (``COMMANDS`` / ``CLIENT_ORDERS``) :
    une ligne enfant dont le parent a été supprimé (orphelin) est **ignorée**.
    Idem pour l'assemblage (carte parente) et le modèle machine.
    """
    links: List[Dict] = []

    # Production (via PRODUCTION_BOM_REVISIONS → PRODUCTIONS ; jointure = pas d'orphelin).
    if rev_ids:
        prods = (
            db.query(Production)
            .join(ProductionBomRevision, ProductionBomRevision.production_id == Production.id)
            .filter(ProductionBomRevision.bom_revision_id.in_(rev_ids))
            .distinct()
            .all()
        )
        for p in prods:
            statut = _status_value(p.status)
            links.append({
                "nature": "production",
                "id": p.id,
                "nom": p.name,
                "statut": statut,
                "label": f'production #{p.id} "{p.name}"' + (f" ({statut})" if statut else ""),
            })

    # Stock cartes (quantité totale > 0).
    total_stock = (
        db.query(func.coalesce(func.sum(BoardStock.qty_in_stock), 0))
        .filter(BoardStock.bom_reference_id == ref.id)
        .scalar()
    ) or 0
    if total_stock > 0:
        links.append({
            "nature": "stock",
            "id": ref.id,
            "quantite": int(total_stock),
            "label": f"stock cartes ({int(total_stock)} en stock)",
        })

    # Commande interne (COMMAND_ITEMS → COMMANDS ; jointure = parent existant seulement).
    if rev_ids:
        cmds = (
            db.query(Command)
            .join(CommandItem, CommandItem.command_id == Command.id)
            .filter(CommandItem.bom_revision_id.in_(rev_ids))
            .distinct()
            .all()
        )
        for c in cmds:
            statut = _status_value(c.status)
            links.append({
                "nature": "commande interne",
                "id": c.id,
                "nom": c.name,
                "statut": statut,
                "label": f'commande interne #{c.id} "{c.name}"' + (f" ({statut})" if statut else ""),
            })

    # Commande client (CLIENT_ORDER_LINES → CLIENT_ORDERS ; jointure = parent existant).
    orders = (
        db.query(ClientOrder)
        .join(ClientOrderLine, ClientOrderLine.order_id == ClientOrder.id)
        .filter(ClientOrderLine.bom_reference_id == ref.id)
        .distinct()
        .all()
    )
    for o in orders:
        statut = _status_value(o.status)
        links.append({
            "nature": "commande client",
            "id": o.id,
            "reference": o.reference,
            "statut": statut,
            "label": f"commande client {o.reference}" + (f" ({statut})" if statut else ""),
        })

    # Assemblage : carte(s) parente(s) (ASSEMBLY_ITEMS → BOM_REFERENCES parent).
    parents = (
        db.query(BomReference)
        .join(AssemblyItem, AssemblyItem.parent_reference_id == BomReference.id)
        .filter(AssemblyItem.child_reference_id == ref.id)
        .distinct()
        .all()
    )
    for parent in parents:
        links.append({
            "nature": "assemblage",
            "id": parent.id,
            "reference": parent.reference,
            "label": f"assemblage {parent.reference} (carte parente)",
        })

    # Modèle machine (MACHINE_MODEL_CARDS → MACHINE_MODELS).
    models = (
        db.query(MachineModel)
        .join(MachineModelCard, MachineModelCard.machine_model_id == MachineModel.id)
        .filter(MachineModelCard.bom_reference_id == ref.id)
        .distinct()
        .all()
    )
    for m in models:
        links.append({
            "nature": "modèle machine",
            "id": m.id,
            "nom": m.name,
            "label": f'modèle machine "{m.name}"',
        })

    return links


def delete_reference(db: Session, bom_reference_id: int) -> Dict:
    """Supprime une carte non liée (sinon lève ``ReferenceLinkedError`` détaillée)."""
    ref = db.query(BomReference).filter(BomReference.id == bom_reference_id).first()
    if not ref:
        raise ValueError(f"Carte {bom_reference_id} introuvable")

    reference_name = ref.reference
    revisions = list(ref.revisions or [])
    rev_ids = [r.id for r in revisions]

    links = _link_details(db, ref, rev_ids)
    if links:
        reasons = [link["label"] for link in links]
        raise ReferenceLinkedError(reference_name, reasons, links)

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
    """Supprime plusieurs cartes ; renvoie un rapport (supprimées / ignorées + bloqueurs)."""
    deleted: List[Dict] = []
    skipped: List[Dict] = []
    for rid in ids:
        try:
            res = delete_reference(db, rid)
            deleted.append({"id": rid, "reference": res["reference"]})
        except ReferenceLinkedError as exc:
            skipped.append({
                "id": rid,
                "reference": exc.reference,
                "reasons": exc.reasons,
                "links": exc.links,
            })
        except ValueError:
            skipped.append({"id": rid, "reference": None, "reasons": ["introuvable"], "links": []})
    return {"deleted": deleted, "skipped": skipped}
