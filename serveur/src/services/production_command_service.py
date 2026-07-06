"""Implicit per-production command + receiving (qty received) tracking.

The Commande page no longer requires a manual "Générer". Instead, one implicit
command per production is maintained automatically and used as the anchor for the
ERP export and the received-quantity tracking. See conversation 2026-06-03.
"""

from __future__ import annotations

import logging
from typing import Dict, List, Optional

from sqlalchemy.orm import Session

from ..models.bom import Component
from ..models.commands import Command, CommandItem, CommandLineDetail, CommandReceipt
from ..models.production import Production
from .command_service import CommandService
from .stock_service import StockService

logger = logging.getLogger(__name__)


class ProductionCommandService:
    """Maintain a single implicit command per production and its receipts."""

    @staticmethod
    def _implicit_name(production_id: int, production: Optional[Production] = None) -> str:
        # T-005 : nom par défaut lisible, dérivé du nom de la production plutôt que
        # du compteur générique « Commande prod N ». Repli sur l'id si nom absent.
        production_name = (getattr(production, "name", None) or "").strip()
        if production_name:
            return f"Commande {production_name}"
        return f"Commande prod {production_id}"

    @classmethod
    def get_or_create_command(cls, db: Session, production_id: int) -> Command:
        command = (
            db.query(Command)
            .filter(Command.production_id == production_id)
            .order_by(Command.id)
            .first()
        )
        if command is None:
            production = (
                db.query(Production)
                .filter(Production.id == production_id)
                .first()
            )
            command = Command(
                name=cls._implicit_name(production_id, production),
                production_id=production_id,
                status=Command.StatusEnum.DRAFT,
            )
            db.add(command)
            db.commit()
            db.refresh(command)
        return command

    @classmethod
    def sync_command(
        cls,
        db: Session,
        production_id: int,
        items: List[Dict],
    ) -> Dict:
        """Upsert the implicit command's items to match the current BOM selection.

        ``items`` = [{"bom_revision_id": int, "quantity": int}, ...].
        Returns the command summary enriched with received quantities.
        """
        production = db.query(Production).filter(Production.id == production_id).first()
        if production is None:
            raise ValueError(f"Production {production_id} not found")

        command = cls.get_or_create_command(db, production_id)

        # Replace items with the current selection (idempotent sync).
        db.query(CommandItem).filter(CommandItem.command_id == command.id).delete()
        seen = set()
        for item in items or []:
            revision_id = int(item.get("bom_revision_id") or 0)
            quantity = int(item.get("quantity") or 0)
            if revision_id < 1 or quantity < 1 or revision_id in seen:
                continue
            seen.add(revision_id)
            db.add(
                CommandItem(
                    command_id=command.id,
                    bom_revision_id=revision_id,
                    quantity_to_produce=quantity,
                )
            )
        db.commit()

        return cls.summary_with_receipts(db, command.id)

    # ------------------------------------------------------------- receipts
    @staticmethod
    def get_receipts(db: Session, command_id: int) -> Dict[str, int]:
        rows = db.query(CommandReceipt).filter(CommandReceipt.command_id == command_id).all()
        return {row.line_key: row.qty_received for row in rows}

    @classmethod
    def set_receipt(cls, db: Session, command_id: int, line_key: str, qty_received: int) -> int:
        row = (
            db.query(CommandReceipt)
            .filter(CommandReceipt.command_id == command_id, CommandReceipt.line_key == line_key)
            .first()
        )
        value = max(int(qty_received or 0), 0)
        if row is None:
            row = CommandReceipt(command_id=command_id, line_key=line_key, qty_received=value)
            db.add(row)
        else:
            row.qty_received = value
        db.commit()
        db.refresh(row)

        # ADR 0010 : IN auto dans l'inventaire physique interne, réconcilié sur la
        # valeur courante de la réception (idempotent). Best-effort : un échec stock
        # ne doit jamais casser la saisie de réception.
        try:
            cls._sync_stock_reception(db, command_id, row)
        except Exception:  # pragma: no cover - defensive
            logger.exception(
                "Stock: échec IN auto réception (command=%s line=%s)",
                command_id,
                line_key,
            )

        return value

    @staticmethod
    def _sync_stock_reception(db: Session, command_id: int, receipt: CommandReceipt) -> None:
        """Résout la ligne agrégée -> Component (get_or_create) et poste l'IN auto."""
        summary = CommandService.get_command_summary(db=db, command_id=command_id)
        line = next(
            (
                item
                for item in summary.get("aggregated_components", [])
                if item.get("key") == receipt.line_key
            ),
            None,
        )
        if line is None:
            logger.warning(
                "Stock: ligne réception %s introuvable dans la commande %s (IN ignoré)",
                receipt.line_key,
                command_id,
            )
            return
        component_id = line.get("component_library_id")
        if not component_id:
            component = StockService.get_or_create_component(
                db,
                value=line.get("value"),
                mpn=line.get("component_mpn"),
                footprint_eagle=line.get("footprint"),
                component_type=line.get("component_type"),
            )
            component_id = component.id
        StockService.post_reception(
            db,
            receipt_id=receipt.id,
            component_id=component_id,
            qty=receipt.qty_received,
        )

    # -------------------------------------------------- manual line completion
    @staticmethod
    def get_line_details(db: Session, command_id: int) -> Dict[str, CommandLineDetail]:
        rows = (
            db.query(CommandLineDetail)
            .filter(CommandLineDetail.command_id == command_id)
            .all()
        )
        return {row.line_key: row for row in rows}

    @staticmethod
    def _detail_to_offer(detail: CommandLineDetail) -> Optional[Dict]:
        """Expose the manual supplier offer as an offer dict, or None if empty."""
        if not (
            (detail.manual_supplier or "").strip()
            or detail.manual_unit_price is not None
            or (detail.manual_product_url or "").strip()
            or (detail.manual_supplier_part or "").strip()
        ):
            return None
        return {
            "supplier": (detail.manual_supplier or "").strip() or None,
            "supplier_part": (detail.manual_supplier_part or "").strip() or None,
            "unit_price": detail.manual_unit_price,
            "currency": (detail.manual_currency or "").strip() or "EUR",
            "product_url": (detail.manual_product_url or "").strip() or None,
            "manual": True,
        }

    @classmethod
    def set_line_detail(
        cls,
        db: Session,
        command_id: int,
        line_key: str,
        *,
        mpn: Optional[str] = None,
        quantity_to_order: Optional[int] = None,
        note: Optional[str] = None,
        supplier: Optional[str] = None,
        supplier_part: Optional[str] = None,
        unit_price: Optional[float] = None,
        currency: Optional[str] = None,
        product_url: Optional[str] = None,
        component_library_id: Optional[int] = None,
    ) -> Dict:
        """Upsert the manual completion of one command line and return the summary.

        The MPN is written on the library component (COMPONENTS, library-wide) when a
        ``component_library_id`` is known; otherwise it is stored as a per-line
        fallback (``manual_mpn``). Quantity/note/manual-offer are always per-line.
        """
        row = (
            db.query(CommandLineDetail)
            .filter(
                CommandLineDetail.command_id == command_id,
                CommandLineDetail.line_key == line_key,
            )
            .first()
        )
        if row is None:
            row = CommandLineDetail(command_id=command_id, line_key=line_key)
            db.add(row)

        # Quantité à commander : None efface l'override (revient à la valeur calculée).
        if quantity_to_order is None:
            row.quantity_to_order = None
        else:
            row.quantity_to_order = max(int(quantity_to_order), 0)

        row.note = (note or "").strip() or None

        # Offre fournisseur manuelle
        row.manual_supplier = (supplier or "").strip() or None
        row.manual_supplier_part = (supplier_part or "").strip() or None
        row.manual_unit_price = unit_price if unit_price is not None else None
        row.manual_currency = (currency or "").strip() or None
        row.manual_product_url = (product_url or "").strip() or None

        # MPN : biblio si composant connu, sinon repli par ligne.
        clean_mpn = (mpn or "").strip()
        if clean_mpn and component_library_id:
            component = (
                db.query(Component)
                .filter(Component.id == component_library_id)
                .first()
            )
            if component is not None:
                component.mpn = clean_mpn
            row.manual_mpn = None
        else:
            row.manual_mpn = clean_mpn or None

        db.commit()
        return cls.summary_with_receipts(db, command_id)

    @classmethod
    def summary_with_receipts(cls, db: Session, command_id: int) -> Dict:
        summary = CommandService.get_command_summary(db=db, command_id=command_id)
        receipts = cls.get_receipts(db, command_id)
        details = cls.get_line_details(db, command_id)
        for line in summary.get("aggregated_components", []):
            key = line.get("key")
            line["qty_received"] = receipts.get(key, 0)

            detail = details.get(key)
            if detail is None:
                line["note"] = ""
                line["quantity_to_order_override"] = None
                line["manual_offer"] = None
                continue

            line["note"] = detail.note or ""
            line["quantity_to_order_override"] = detail.quantity_to_order
            line["manual_offer"] = cls._detail_to_offer(detail)
            # MPN de repli quand la biblio n'en fournit pas.
            if not (line.get("component_mpn") or "").strip() and detail.manual_mpn:
                line["component_mpn"] = detail.manual_mpn
                if not (line.get("component_name") or "").strip() or line.get("component_name") == line.get("value"):
                    line["component_name"] = detail.manual_mpn

        summary["command_id"] = command_id
        return summary
