"""Services : stock de cartes finies + commandes client/machine (ADR 0017).

Réutilise ``PRODUCTION_COSTING`` (prix de référence par carte) et ``BomReference``
(catalogue des cartes). Prix effectif = override manuel sinon prix Costing.
"""

from typing import Dict, List, Optional

from sqlalchemy.orm import Session, joinedload

from ..database import utcnow
from ..models.board_stock import (
    BoardStock,
    Client,
    ClientOrder,
    ClientOrderLine,
    MachineModel,
    MachineModelCard,
)
from ..models.bom import BomReference, BomRevision
from ..models.costing import ProductionCosting

_ACTIVE_ORDER_STATUSES = ("OPEN", "READY")


def _norm_rev(revision) -> str:
    """Normalise une révision (None/espaces -> '')."""
    return (revision or "").strip()


def _reference_revisions(db: Session) -> Dict[int, List[str]]:
    """{bom_reference_id: [révisions distinctes connues]} depuis les BOM importées."""
    rows = (
        db.query(BomRevision.bom_ref_id, BomRevision.revision)
        .distinct()
        .all()
    )
    out: Dict[int, List[str]] = {}
    for ref_id, rev in rows:
        rev = _norm_rev(rev)
        if not rev:
            continue
        out.setdefault(ref_id, [])
        if rev not in out[ref_id]:
            out[ref_id].append(rev)
    for ref_id in out:
        out[ref_id].sort()
    return out


def _reference_prices(db: Session) -> Dict[int, float]:
    """{bom_reference_id: prix unitaire HT de référence (Costing)}."""
    rows = (
        db.query(ProductionCosting)
        .filter(ProductionCosting.is_reference == True)  # noqa: E712 (SQL Server)
        .order_by(ProductionCosting.computed_at.desc())
        .all()
    )
    prices: Dict[int, float] = {}
    for row in rows:
        # Le premier rencontré (tri desc) est le plus récent → on ne l'écrase pas.
        if row.bom_reference_id not in prices and row.unit_cost_ht is not None:
            prices[row.bom_reference_id] = row.unit_cost_ht
    return prices


class BoardStockService:
    """Stock de cartes finies par référence de carte."""

    @staticmethod
    def _effective_price(stock: Optional[BoardStock], ref_price: Optional[float]) -> Optional[float]:
        if stock is not None and stock.unit_price_override is not None:
            return stock.unit_price_override
        return ref_price

    @classmethod
    def list_board_stock(cls, db: Session) -> List[Dict]:
        """Stock par (référence, révision). Une ligne par révision connue de la
        référence ; une ligne '' si la référence n'a aucune révision importée."""
        refs = db.query(BomReference).order_by(BomReference.reference).all()
        stocks = {(s.bom_reference_id, _norm_rev(s.revision)): s for s in db.query(BoardStock).all()}
        ref_prices = _reference_prices(db)
        ref_revs = _reference_revisions(db)

        out: List[Dict] = []
        for ref in refs:
            revisions = ref_revs.get(ref.id) or [""]
            # Inclure aussi les révisions ayant déjà une ligne de stock (hors BOM).
            for key_rev in [r for (rid, r) in stocks if rid == ref.id]:
                if key_rev not in revisions:
                    revisions.append(key_rev)
            for rev in revisions:
                stock = stocks.get((ref.id, rev))
                qty = stock.qty_in_stock if stock else 0
                min_stock = stock.min_stock if stock else 0
                ref_price = ref_prices.get(ref.id)
                effective = cls._effective_price(stock, ref_price)
                out.append({
                    "bom_reference_id": ref.id,
                    "reference": ref.reference,
                    "revision": rev,
                    "category": ref.category,
                    "qty_in_stock": qty,
                    "min_stock": min_stock,
                    "below_min": qty < min_stock,
                    "unit_price_override": stock.unit_price_override if stock else None,
                    "reference_unit_cost_ht": ref_price,
                    "unit_price_effective": effective,
                    "stock_value": round(effective * qty, 2) if effective is not None else None,
                    "cards_tested": stock.cards_tested if stock else 0,
                    "cards_validated": stock.cards_validated if stock else 0,
                    "cards_to_debug": stock.cards_to_debug if stock else 0,
                    "notes": stock.notes if stock else None,
                    "has_row": stock is not None,
                })
        return out

    @staticmethod
    def _get_or_create(db: Session, bom_reference_id: int, revision: str = "") -> BoardStock:
        revision = _norm_rev(revision)
        row = (
            db.query(BoardStock)
            .filter(BoardStock.bom_reference_id == bom_reference_id, BoardStock.revision == revision)
            .first()
        )
        if row is None:
            row = BoardStock(bom_reference_id=bom_reference_id, revision=revision)
            db.add(row)
        return row

    @classmethod
    def upsert(
        cls,
        db: Session,
        bom_reference_id: int,
        *,
        revision: str = "",
        qty_in_stock: Optional[int] = None,
        min_stock: Optional[int] = None,
        unit_price_override: Optional[float] = None,
        clear_price_override: bool = False,
        cards_tested: Optional[int] = None,
        cards_validated: Optional[int] = None,
        cards_to_debug: Optional[int] = None,
        notes: Optional[str] = None,
    ) -> BoardStock:
        ref = db.query(BomReference).filter(BomReference.id == bom_reference_id).first()
        if ref is None:
            raise ValueError(f"Référence de carte {bom_reference_id} introuvable")
        row = cls._get_or_create(db, bom_reference_id, revision)
        if qty_in_stock is not None:
            row.qty_in_stock = max(int(qty_in_stock), 0)
        if min_stock is not None:
            row.min_stock = max(int(min_stock), 0)
        if clear_price_override:
            row.unit_price_override = None
        elif unit_price_override is not None:
            row.unit_price_override = max(float(unit_price_override), 0.0)
        if cards_tested is not None:
            row.cards_tested = max(int(cards_tested), 0)
        if cards_validated is not None:
            row.cards_validated = max(int(cards_validated), 0)
        if cards_to_debug is not None:
            row.cards_to_debug = max(int(cards_to_debug), 0)
        if notes is not None:
            row.notes = notes.strip() or None
        db.commit()
        db.refresh(row)
        return row

    @classmethod
    def adjust_qty(cls, db: Session, bom_reference_id: int, delta: int, revision: str = "") -> BoardStock:
        row = cls._get_or_create(db, bom_reference_id, revision)
        row.qty_in_stock = max(int(row.qty_in_stock or 0) + int(delta), 0)
        db.commit()
        db.refresh(row)
        return row

    @classmethod
    def cards_to_produce(cls, db: Session) -> List[Dict]:
        """Manques de cartes = demande restante des commandes actives − stock dispo,
        par (référence, révision)."""
        ref_names = {r.id: r for r in db.query(BomReference).all()}
        stocks = {(s.bom_reference_id, _norm_rev(s.revision)): s.qty_in_stock for s in db.query(BoardStock).all()}

        demand: Dict[tuple, int] = {}
        lines = (
            db.query(ClientOrderLine)
            .join(ClientOrder, ClientOrder.id == ClientOrderLine.order_id)
            .filter(ClientOrder.status.in_(_ACTIVE_ORDER_STATUSES))
            .all()
        )
        for line in lines:
            remaining = max(int(line.quantity or 0) - int(line.quantity_prepared or 0), 0)
            if remaining:
                key = (line.bom_reference_id, _norm_rev(line.revision))
                demand[key] = demand.get(key, 0) + remaining

        out: List[Dict] = []
        for (ref_id, rev), needed in demand.items():
            available = int(stocks.get((ref_id, rev), 0))
            shortage = max(needed - available, 0)
            if shortage <= 0:
                continue
            ref = ref_names.get(ref_id)
            out.append({
                "bom_reference_id": ref_id,
                "reference": ref.reference if ref else None,
                "revision": rev,
                "demand_remaining": needed,
                "in_stock": available,
                "to_produce": shortage,
            })
        out.sort(key=lambda r: -r["to_produce"])
        return out


class ClientOrderService:
    """Commandes client/machine + préparation de boîte."""

    @staticmethod
    def _next_reference(db: Session) -> str:
        last = db.query(ClientOrder).order_by(ClientOrder.id.desc()).first()
        n = (last.id + 1) if last else 1
        return f"CMD-{n:04d}"

    @classmethod
    def _serialize_line(cls, line: ClientOrderLine) -> Dict:
        ref = line.reference
        return {
            "id": line.id,
            "bom_reference_id": line.bom_reference_id,
            "reference": ref.reference if ref else None,
            "revision": _norm_rev(line.revision),
            "quantity": line.quantity,
            "quantity_prepared": line.quantity_prepared,
            "remaining": max(int(line.quantity or 0) - int(line.quantity_prepared or 0), 0),
            "notes": line.notes,
        }

    @classmethod
    def _serialize(cls, order: ClientOrder) -> Dict:
        lines = [cls._serialize_line(line) for line in order.lines]
        total_qty = sum(line["quantity"] for line in lines)
        total_prepared = sum(line["quantity_prepared"] for line in lines)
        machine_name = order.machine_model.name if order.machine_model else None
        return {
            "id": order.id,
            "reference": order.reference,
            "order_type": order.order_type,
            "client_id": order.client_id,
            "machine_model_id": order.machine_model_id,
            "machine_model_name": machine_name,
            "machine_count": order.machine_count,
            "recipient": order.recipient,
            "label": (
                f"{machine_name} ×{order.machine_count}"
                if order.order_type == "MACHINE" and machine_name
                else (order.recipient or order.reference)
            ),
            "status": order.status,
            "due_date": order.due_date.isoformat() if order.due_date else None,
            "delivered_at": order.delivered_at.isoformat() if order.delivered_at else None,
            "notes": order.notes,
            "created_at": order.created_at.isoformat() if order.created_at else None,
            "updated_at": order.updated_at.isoformat() if order.updated_at else None,
            "lines": lines,
            "total_quantity": total_qty,
            "total_prepared": total_prepared,
            "fully_prepared": total_qty > 0 and total_prepared >= total_qty,
        }

    @classmethod
    def list_orders(cls, db: Session) -> List[Dict]:
        orders = (
            db.query(ClientOrder)
            .options(joinedload(ClientOrder.lines).joinedload(ClientOrderLine.reference))
            .order_by(ClientOrder.created_at.desc(), ClientOrder.id.desc())
            .all()
        )
        return [cls._serialize(o) for o in orders]

    @classmethod
    def get_order(cls, db: Session, order_id: int) -> Dict:
        order = db.query(ClientOrder).filter(ClientOrder.id == order_id).first()
        if order is None:
            raise ValueError(f"Commande {order_id} introuvable")
        return cls._serialize(order)

    @classmethod
    def create_order(
        cls,
        db: Session,
        *,
        order_type: str = "CLIENT",
        client_id: Optional[int] = None,
        recipient: Optional[str] = None,
        due_date=None,
        notes: Optional[str] = None,
        lines: Optional[List[Dict]] = None,
        machine_model_id: Optional[int] = None,
        machine_count: Optional[int] = None,
    ) -> Dict:
        otype = (order_type or "CLIENT").upper()
        if otype not in ("CLIENT", "MACHINE"):
            otype = "CLIENT"
        order = ClientOrder(
            reference=cls._next_reference(db),
            order_type=otype,
            client_id=client_id,
            recipient=(recipient or "").strip() or None,
            status="OPEN",
            due_date=due_date,
            notes=(notes or "").strip() or None,
        )

        # Matérialisation par (référence, révision).
        materialized: Dict[tuple, int] = {}
        if otype == "MACHINE" and machine_model_id:
            model = db.query(MachineModel).filter(MachineModel.id == machine_model_id).first()
            if model is None:
                raise ValueError(f"Modèle de machine {machine_model_id} introuvable")
            count = max(int(machine_count or 1), 1)
            order.machine_model_id = model.id
            order.machine_count = count
            for card in model.cards:
                key = (card.bom_reference_id, _norm_rev(card.revision))
                materialized[key] = materialized.get(key, 0) + int(card.quantity or 0) * count
        else:
            for line in (lines or []):
                ref_id = line.get("bom_reference_id")
                qty = max(int(line.get("quantity") or 0), 0)
                if ref_id and qty > 0:
                    key = (int(ref_id), _norm_rev(line.get("revision")))
                    materialized[key] = materialized.get(key, 0) + qty

        db.add(order)
        db.flush()
        for (ref_id, rev), qty in materialized.items():
            if qty > 0:
                db.add(ClientOrderLine(order_id=order.id, bom_reference_id=ref_id, revision=(rev or None), quantity=qty))
        db.commit()
        db.refresh(order)
        return cls._serialize(order)

    @classmethod
    def update_order(
        cls,
        db: Session,
        order_id: int,
        *,
        recipient: Optional[str] = None,
        order_type: Optional[str] = None,
        status: Optional[str] = None,
        due_date=None,
        due_date_provided: bool = False,
        notes: Optional[str] = None,
    ) -> Dict:
        order = db.query(ClientOrder).filter(ClientOrder.id == order_id).first()
        if order is None:
            raise ValueError(f"Commande {order_id} introuvable")
        if recipient is not None:
            order.recipient = recipient.strip() or None
        if order_type is not None and order_type.upper() in ("CLIENT", "MACHINE"):
            order.order_type = order_type.upper()
        if status is not None and status.upper() in ("OPEN", "READY", "DELIVERED", "CANCELLED"):
            new_status = status.upper()
            if new_status == "DELIVERED" and order.status != "DELIVERED":
                order.delivered_at = utcnow()  # date de livraison
            elif new_status != "DELIVERED":
                order.delivered_at = None
            order.status = new_status
        if due_date_provided:
            order.due_date = due_date
        if notes is not None:
            order.notes = notes.strip() or None
        db.commit()
        db.refresh(order)
        return cls._serialize(order)

    @classmethod
    def set_lines(cls, db: Session, order_id: int, lines: List[Dict]) -> Dict:
        """Remplace les lignes en préservant les quantités déjà préparées par référence."""
        order = db.query(ClientOrder).filter(ClientOrder.id == order_id).first()
        if order is None:
            raise ValueError(f"Commande {order_id} introuvable")
        prepared_by_ref = {(line.bom_reference_id, _norm_rev(line.revision)): line.quantity_prepared for line in order.lines}
        for line in list(order.lines):
            db.delete(line)
        db.flush()
        for line in (lines or []):
            ref_id = line.get("bom_reference_id")
            qty = max(int(line.get("quantity") or 0), 0)
            if not ref_id or qty <= 0:
                continue
            rev = _norm_rev(line.get("revision"))
            prepared = min(int(prepared_by_ref.get((int(ref_id), rev), 0)), qty)
            db.add(ClientOrderLine(
                order_id=order.id,
                bom_reference_id=int(ref_id),
                revision=(rev or None),
                quantity=qty,
                quantity_prepared=prepared,
                notes=(line.get("notes") or "").strip() or None,
            ))
        cls._recompute_status(order, db)
        db.commit()
        db.refresh(order)
        return cls._serialize(order)

    @classmethod
    def delete_order(cls, db: Session, order_id: int) -> None:
        order = db.query(ClientOrder).filter(ClientOrder.id == order_id).first()
        if order is None:
            raise ValueError(f"Commande {order_id} introuvable")
        db.delete(order)
        db.commit()

    @staticmethod
    def _recompute_status(order: ClientOrder, db: Session) -> None:
        if order.status in ("DELIVERED", "CANCELLED"):
            return
        lines = order.lines
        total = sum(int(line.quantity or 0) for line in lines)
        prepared = sum(int(line.quantity_prepared or 0) for line in lines)
        order.status = "READY" if (total > 0 and prepared >= total) else "OPEN"

    @classmethod
    def prepare(cls, db: Session, order_id: int, line_id: int, qty: int) -> Dict:
        """Prépare `qty` cartes d'une ligne : +quantity_prepared, −stock cartes."""
        order = db.query(ClientOrder).filter(ClientOrder.id == order_id).first()
        if order is None:
            raise ValueError(f"Commande {order_id} introuvable")
        line = next((l for l in order.lines if l.id == line_id), None)
        if line is None:
            raise ValueError(f"Ligne {line_id} introuvable")
        qty = int(qty)
        room = max(int(line.quantity or 0) - int(line.quantity_prepared or 0), 0)
        # Autorise le retrait (qty négatif) jusqu'à 0 ; borne l'ajout au reste à préparer.
        applied = max(-int(line.quantity_prepared or 0), min(qty, room))
        if applied != 0:
            line.quantity_prepared = int(line.quantity_prepared or 0) + applied
            # Retire du stock (référence + révision) ce qui est ajouté à la boîte.
            BoardStockService.adjust_qty(db, line.bom_reference_id, -applied, _norm_rev(line.revision))
        cls._recompute_status(order, db)
        db.commit()
        db.refresh(order)
        return cls._serialize(order)


class ClientService:
    """Clients de l'entreprise + vue détaillée (commandes/machines + à préparer)."""

    @classmethod
    def list_clients(cls, db: Session) -> List[Dict]:
        clients = db.query(Client).order_by(Client.name).all()
        out: List[Dict] = []
        for client in clients:
            active_orders = [o for o in client.orders if o.status in _ACTIVE_ORDER_STATUSES]
            to_prepare = 0
            for order in active_orders:
                for line in order.lines:
                    to_prepare += max(int(line.quantity or 0) - int(line.quantity_prepared or 0), 0)
            out.append({
                "id": client.id,
                "name": client.name,
                "contact": client.contact,
                "notes": client.notes,
                "order_count": len(client.orders),
                "active_order_count": len(active_orders),
                "cards_to_prepare": to_prepare,
            })
        return out

    @classmethod
    def create_client(cls, db: Session, *, name: str, contact: Optional[str] = None, notes: Optional[str] = None) -> Dict:
        clean = (name or "").strip()
        if not clean:
            raise ValueError("Nom du client requis")
        if db.query(Client).filter(Client.name == clean).first():
            raise ValueError(f"Le client « {clean} » existe déjà")
        client = Client(name=clean, contact=(contact or "").strip() or None, notes=(notes or "").strip() or None)
        db.add(client)
        db.commit()
        db.refresh(client)
        return {"id": client.id, "name": client.name}

    @classmethod
    def update_client(cls, db: Session, client_id: int, *, name=None, contact=None, notes=None) -> Dict:
        client = db.query(Client).filter(Client.id == client_id).first()
        if client is None:
            raise ValueError(f"Client {client_id} introuvable")
        if name is not None and name.strip():
            client.name = name.strip()
        if contact is not None:
            client.contact = contact.strip() or None
        if notes is not None:
            client.notes = notes.strip() or None
        db.commit()
        return {"id": client.id, "name": client.name}

    @classmethod
    def delete_client(cls, db: Session, client_id: int) -> None:
        client = db.query(Client).filter(Client.id == client_id).first()
        if client is None:
            raise ValueError(f"Client {client_id} introuvable")
        for order in client.orders:  # détache sans supprimer les commandes
            order.client_id = None
        db.delete(client)
        db.commit()

    @classmethod
    def client_detail(cls, db: Session, client_id: int) -> Dict:
        client = db.query(Client).filter(Client.id == client_id).first()
        if client is None:
            raise ValueError(f"Client {client_id} introuvable")
        orders = [ClientOrderService._serialize(o) for o in sorted(client.orders, key=lambda o: -o.id)]

        ref_names = {r.id: r.reference for r in db.query(BomReference).all()}
        stocks = {(s.bom_reference_id, _norm_rev(s.revision)): s.qty_in_stock for s in db.query(BoardStock).all()}
        to_prepare: Dict[tuple, int] = {}
        for order in client.orders:
            if order.status not in _ACTIVE_ORDER_STATUSES:
                continue
            for line in order.lines:
                remaining = max(int(line.quantity or 0) - int(line.quantity_prepared or 0), 0)
                if remaining:
                    key = (line.bom_reference_id, _norm_rev(line.revision))
                    to_prepare[key] = to_prepare.get(key, 0) + remaining
        cards_to_prepare = [
            {
                "bom_reference_id": ref_id,
                "reference": ref_names.get(ref_id),
                "revision": rev,
                "to_prepare": qty,
                "in_stock": int(stocks.get((ref_id, rev), 0)),
                "shortage": max(qty - int(stocks.get((ref_id, rev), 0)), 0),
            }
            for (ref_id, rev), qty in sorted(to_prepare.items(), key=lambda kv: -kv[1])
        ]
        return {
            "id": client.id,
            "name": client.name,
            "contact": client.contact,
            "notes": client.notes,
            "orders": orders,
            "cards_to_prepare": cards_to_prepare,
        }


class MachineModelService:
    """Catalogue de modèles de machine (nom + liste de cartes)."""

    @classmethod
    def _serialize(cls, model: MachineModel) -> Dict:
        cards = [
            {
                "id": c.id,
                "bom_reference_id": c.bom_reference_id,
                "reference": c.reference.reference if c.reference else None,
                "revision": _norm_rev(c.revision),
                "quantity": c.quantity,
            }
            for c in model.cards
        ]
        return {
            "id": model.id,
            "name": model.name,
            "notes": model.notes,
            "cards": cards,
            "card_types": len(cards),
            "total_cards": sum(int(c["quantity"] or 0) for c in cards),
        }

    @classmethod
    def list_models(cls, db: Session) -> List[Dict]:
        models = (
            db.query(MachineModel)
            .options(joinedload(MachineModel.cards).joinedload(MachineModelCard.reference))
            .order_by(MachineModel.name)
            .all()
        )
        return [cls._serialize(m) for m in models]

    @classmethod
    def create_model(cls, db: Session, *, name: str, notes: Optional[str] = None, cards: Optional[List[Dict]] = None) -> Dict:
        clean = (name or "").strip()
        if not clean:
            raise ValueError("Nom de la machine requis")
        if db.query(MachineModel).filter(MachineModel.name == clean).first():
            raise ValueError(f"La machine « {clean} » existe déjà")
        model = MachineModel(name=clean, notes=(notes or "").strip() or None)
        db.add(model)
        db.flush()
        cls._apply_cards(db, model, cards or [])
        db.commit()
        db.refresh(model)
        return cls._serialize(model)

    @classmethod
    def update_model(cls, db: Session, model_id: int, *, name=None, notes=None, cards=None) -> Dict:
        model = db.query(MachineModel).filter(MachineModel.id == model_id).first()
        if model is None:
            raise ValueError(f"Machine {model_id} introuvable")
        if name is not None and name.strip():
            model.name = name.strip()
        if notes is not None:
            model.notes = notes.strip() or None
        if cards is not None:
            for card in list(model.cards):
                db.delete(card)
            db.flush()
            cls._apply_cards(db, model, cards)
        db.commit()
        db.refresh(model)
        return cls._serialize(model)

    @staticmethod
    def _apply_cards(db: Session, model: MachineModel, cards: List[Dict]) -> None:
        for card in cards:
            ref_id = card.get("bom_reference_id")
            qty = max(int(card.get("quantity") or 0), 0)
            if ref_id and qty > 0:
                rev = _norm_rev(card.get("revision"))
                db.add(MachineModelCard(
                    machine_model_id=model.id,
                    bom_reference_id=int(ref_id),
                    revision=(rev or None),
                    quantity=qty,
                ))

    @classmethod
    def delete_model(cls, db: Session, model_id: int) -> None:
        model = db.query(MachineModel).filter(MachineModel.id == model_id).first()
        if model is None:
            raise ValueError(f"Machine {model_id} introuvable")
        db.delete(model)
        db.commit()
