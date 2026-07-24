"""Service : catalogue de cartes unifié (ADR 0018).

Vue « nos cartes » agrégée sur ``BOM_REFERENCES`` : notre référence, code KELENN
(``part_number``), nom, type (SIMPLE/ASSEMBLY), catégorie, révisions connues (BOM),
prix + date (Costing pour SIMPLE, somme des enfants pour ASSEMBLY), et composition
si assemblage. Source de vérité unique, pas de table parallèle.
"""

from typing import Dict, List, Optional

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from ..models.bom import AssemblyItem, BomReference, BomRevision, Component
from ..models.costing import ProductionCosting
from .bom_file_service import BomFileService


bom_file_service = BomFileService()


class CardReferenceConflict(Exception):
    """La référence de carte demandée est déjà utilisée (prompt 025) → 409."""

_ASSEMBLY = "ASSEMBLY"
_SIMPLE = "SIMPLE"


def _norm_type(value) -> str:
    v = (value or "").strip().upper()
    return _ASSEMBLY if v == _ASSEMBLY else _SIMPLE


def _reference_prices(db: Session) -> Dict[int, float]:
    """{bom_reference_id: prix unitaire HT de référence (Costing, le plus récent)}."""
    rows = (
        db.query(ProductionCosting)
        .filter(ProductionCosting.is_reference == True)  # noqa: E712
        .order_by(ProductionCosting.computed_at.desc())
        .all()
    )
    prices: Dict[int, float] = {}
    for row in rows:
        if row.bom_reference_id not in prices and row.unit_cost_ht is not None:
            prices[row.bom_reference_id] = row.unit_cost_ht
    return prices


def _reference_revisions(db: Session) -> Dict[int, List[str]]:
    """{bom_reference_id: [révisions distinctes connues]} depuis les BOM importées."""
    rows = db.query(BomRevision.bom_ref_id, BomRevision.revision).distinct().all()
    out: Dict[int, List[str]] = {}
    for ref_id, rev in rows:
        rev = (rev or "").strip()
        if not rev:
            continue
        out.setdefault(ref_id, [])
        if rev not in out[ref_id]:
            out[ref_id].append(rev)
    for ref_id in out:
        out[ref_id].sort()
    return out


class CardCatalogService:
    """Catalogue de cartes (lecture agrégée + édition fiche + assemblage)."""

    # ───────────────────────── Prix ─────────────────────────

    @classmethod
    def _card_price(
        cls,
        db: Session,
        ref: BomReference,
        ref_prices: Dict[int, float],
        _stack: Optional[set] = None,
    ) -> Dict:
        """Prix effectif d'une carte. SIMPLE = Costing. ASSEMBLY = somme des
        enfants (sous-cartes récursives + composants). ``complete`` = tous les
        éléments avaient un prix connu."""
        _stack = _stack or set()
        if _norm_type(ref.card_type) != _ASSEMBLY:
            price = ref_prices.get(ref.id)
            return {"price": price, "complete": price is not None}

        # Assemblage : somme des enfants. Garde-fou anti-cycle.
        if ref.id in _stack:
            return {"price": None, "complete": False}
        _stack = _stack | {ref.id}
        total = 0.0
        complete = True
        for item in ref.assembly_items:
            qty = int(item.quantity or 0)
            if item.child_reference_id and item.child is not None:
                sub = cls._card_price(db, item.child, ref_prices, _stack)
                if sub["price"] is None:
                    complete = False
                else:
                    total += sub["price"] * qty
            elif item.component_id is not None:
                # Prix composant unitaire non modélisé en v1 -> inconnu.
                complete = False
        return {"price": round(total, 2), "complete": complete}

    # ───────────────────────── Lecture ─────────────────────────

    @classmethod
    def _serialize_assembly(cls, ref: BomReference, ref_names: Dict[int, str], comp_names: Dict[int, str]) -> List[Dict]:
        items = []
        for it in ref.assembly_items:
            kind = "card" if it.child_reference_id else "component"
            items.append({
                "id": it.id,
                "kind": kind,
                "child_reference_id": it.child_reference_id,
                "component_id": it.component_id,
                "label": (
                    ref_names.get(it.child_reference_id)
                    if kind == "card"
                    else comp_names.get(it.component_id)
                ),
                "quantity": it.quantity,
            })
        return items

    @classmethod
    def list_cards(cls, db: Session) -> List[Dict]:
        refs = (
            db.query(BomReference)
            .options(joinedload(BomReference.assembly_items))
            .order_by(BomReference.reference)
            .all()
        )
        ref_prices = _reference_prices(db)
        ref_revs = _reference_revisions(db)
        ref_names = {r.id: (r.name or r.reference) for r in refs}
        comp_names = {c.id: (c.value or c.mpn or c.reference) for c in db.query(Component).all()}

        out: List[Dict] = []
        for ref in refs:
            ctype = _norm_type(ref.card_type)
            price = cls._card_price(db, ref, ref_prices)
            out.append({
                "bom_reference_id": ref.id,
                "reference": ref.reference,
                "name": ref.name,
                "part_number": ref.part_number,
                "card_type": ctype,
                "category": ref.category,
                "revisions": ref_revs.get(ref.id, []),
                "unit_price": price["price"],
                "price_complete": price["complete"],
                "assembly_items": cls._serialize_assembly(ref, ref_names, comp_names) if ctype == _ASSEMBLY else [],
            })
        return out

    @classmethod
    def get_card(cls, db: Session, bom_reference_id: int) -> Dict:
        card = next((c for c in cls.list_cards(db) if c["bom_reference_id"] == bom_reference_id), None)
        if card is None:
            raise ValueError(f"Carte {bom_reference_id} introuvable")
        return card

    # ───────────────────────── Édition fiche ─────────────────────────

    @classmethod
    def update_card(
        cls,
        db: Session,
        bom_reference_id: int,
        *,
        name: Optional[str] = None,
        part_number: Optional[str] = None,
        card_type: Optional[str] = None,
        reference: Optional[str] = None,
    ) -> Dict:
        ref = db.query(BomReference).filter(BomReference.id == bom_reference_id).first()
        if ref is None:
            raise ValueError(f"Carte {bom_reference_id} introuvable")
        # Référence catalogue (prompt 025) : éditable, unique, snapshots déplacés.
        old_reference = None
        new_reference = None
        if reference is not None:
            candidate = reference.strip()
            if not candidate:
                raise ValueError("La référence ne peut pas être vide")
            if candidate != ref.reference:
                clash = (
                    db.query(BomReference)
                    .filter(BomReference.reference == candidate, BomReference.id != ref.id)
                    .first()
                )
                if clash is not None:
                    raise CardReferenceConflict(
                        f"Référence « {candidate} » déjà utilisée par une autre carte"
                    )
                old_reference = ref.reference
                new_reference = candidate
                ref.reference = candidate
        if name is not None:
            ref.name = name.strip() or None
        if part_number is not None:
            pn = part_number.strip() or None
            if pn:
                clash = (
                    db.query(BomReference)
                    .filter(BomReference.part_number == pn, BomReference.id != ref.id)
                    .first()
                )
                if clash is not None:
                    raise ValueError(f"Le code « {pn} » est déjà attribué à {clash.reference}")
            ref.part_number = pn
        if card_type is not None:
            ref.card_type = _norm_type(card_type)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            raise CardReferenceConflict(
                f"Référence « {new_reference} » déjà utilisée par une autre carte"
            )
        # Déplacer les snapshots internes vers la nouvelle référence (best-effort ;
        # jamais d'écriture sur le partage \\rs\Elec\... — stockage interne seul).
        if old_reference and new_reference:
            try:
                bom_file_service.rename_reference_tree(old_reference, new_reference)
            except Exception:  # noqa: BLE001 — snapshots best-effort
                pass
        return cls.get_card(db, bom_reference_id)

    # ───────────────────────── Assemblage ─────────────────────────

    @classmethod
    def _would_cycle(cls, db: Session, parent_id: int, child_id: int) -> bool:
        """Vrai si ajouter child_id sous parent_id crée un cycle (child atteint parent)."""
        if child_id == parent_id:
            return True
        seen = set()
        stack = [child_id]
        while stack:
            cur = stack.pop()
            if cur in seen:
                continue
            seen.add(cur)
            if cur == parent_id:
                return True
            children = (
                db.query(AssemblyItem.child_reference_id)
                .filter(AssemblyItem.parent_reference_id == cur, AssemblyItem.child_reference_id.isnot(None))
                .all()
            )
            stack.extend(cid for (cid,) in children)
        return False

    @classmethod
    def set_assembly(cls, db: Session, bom_reference_id: int, items: List[Dict]) -> Dict:
        """Remplace la composition d'un assemblage. Chaque item = sous-carte
        (child_reference_id) OU composant (component_id) + quantity."""
        ref = db.query(BomReference).filter(BomReference.id == bom_reference_id).first()
        if ref is None:
            raise ValueError(f"Carte {bom_reference_id} introuvable")
        ref.card_type = _ASSEMBLY  # devenir un assemblage dès qu'on lui donne une composition
        for it in list(ref.assembly_items):
            db.delete(it)
        db.flush()
        for it in (items or []):
            qty = max(int(it.get("quantity") or 0), 0)
            if qty <= 0:
                continue
            child_id = it.get("child_reference_id")
            comp_id = it.get("component_id")
            if child_id and comp_id:
                raise ValueError("Un élément d'assemblage est soit une carte, soit un composant, pas les deux")
            if child_id:
                child_id = int(child_id)
                if cls._would_cycle(db, bom_reference_id, child_id):
                    raise ValueError("Composition invalide : une carte ne peut pas se contenir elle-même")
                db.add(AssemblyItem(parent_reference_id=ref.id, child_reference_id=child_id, quantity=qty))
            elif comp_id:
                db.add(AssemblyItem(parent_reference_id=ref.id, component_id=int(comp_id), quantity=qty))
        db.commit()
        return cls.get_card(db, bom_reference_id)

    @classmethod
    def find_by_part_number(cls, db: Session, part_number: str) -> Optional[BomReference]:
        pn = (part_number or "").strip()
        if not pn:
            return None
        return db.query(BomReference).filter(BomReference.part_number == pn).first()
