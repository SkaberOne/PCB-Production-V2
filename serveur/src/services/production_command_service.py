"""Implicit per-production command + receiving (qty received) tracking.

The Commande page no longer requires a manual "Générer". Instead, one implicit
command per production is maintained automatically and used as the anchor for the
ERP export and the received-quantity tracking. See conversation 2026-06-03.
"""

from __future__ import annotations

import logging
from typing import Dict, List, Optional

from sqlalchemy.orm import Session

from ..models.commands import Command, CommandItem, CommandReceipt
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

    @classmethod
    def summary_with_receipts(cls, db: Session, command_id: int) -> Dict:
        summary = CommandService.get_command_summary(db=db, command_id=command_id)
        receipts = cls.get_receipts(db, command_id)
        for line in summary.get("aggregated_components", []):
            line["qty_received"] = receipts.get(line.get("key"), 0)
        summary["command_id"] = command_id
        return summary
