"""Export ERP « Nouvelle Demande d'Achat » d'une commande (openpyxl).

Extrait de ``command_service`` (dette 017) : la génération du classeur ERP et
ses helpers vivent ici. Comportement identique — ``CommandService`` reste la
source des données (``get_command_summary``).
"""

from io import BytesIO
from typing import Dict, List, Optional, Tuple

from openpyxl import Workbook
from sqlalchemy.orm import Session

from .command_service import CommandService


class CommandExportService:
    """Génère le classeur ERP d'achat d'une commande."""

    # ERP "Nouvelle Demande d'Achat" columns (12) — mapped to the ERP form.
    # See docs/audits/Audit_2026-06-03_integration_api_fournisseurs.md §6.2.
    ERP_HEADERS = [
        "Référence fournisseur",
        "Fournisseur",
        "Description",
        "Lien web",
        "Référence KT",
        "Quantité",
        "Unité",
        "Projet",
        "Demandeur",
        "Validateur",
        "Délai",
        "Remarques",
    ]

    # Canonical supplier code -> label expected by the ERP import.
    SUPPLIER_LABELS = {
        "MOUSER": "Mouser",
        "DIGIKEY": "Digi-Key",
        "FARNELL": "Farnell",
        "RS": "RS",
    }

    @staticmethod
    def _clean_export_text(value: Optional[str]) -> str:
        if value is None:
            return ""
        return str(value).strip()

    @classmethod
    def _supplier_label(cls, supplier_code: Optional[str], default: Optional[str] = None) -> str:
        if not supplier_code:
            return cls._clean_export_text(default)
        return cls.SUPPLIER_LABELS.get(supplier_code.upper(), supplier_code)

    @classmethod
    def _build_description(cls, line: Dict, offer: Optional[Dict]) -> str:
        manufacturer = (offer or {}).get("manufacturer")
        mpn = (offer or {}).get("mpn") or line.get("component_mpn")
        value = line.get("value")
        footprint = line.get("footprint")
        parts = [p for p in (manufacturer, mpn) if p]
        head = " ".join(parts) if parts else cls._clean_export_text(value)
        tail = " / ".join(p for p in (value, footprint) if p and p != head)
        return cls._clean_export_text(f"{head} — {tail}" if tail else head)

    @classmethod
    def _build_erp_export_rows(
        cls,
        command_summary: Dict,
        defaults: Dict[str, str],
        offers_by_component: Optional[Dict[int, Dict]] = None,
        line_overrides: Optional[Dict[str, int]] = None,
        line_offer_override: Optional[Dict[str, Dict]] = None,
    ) -> List[Dict[str, object]]:
        rows: List[Dict[str, object]] = []
        overrides = line_overrides or {}
        offers_by_component = offers_by_component or {}
        line_offer_override = line_offer_override or {}

        for line in command_summary.get("aggregated_components", []):
            # Feature B : fournisseur choisi par ligne prime sur le meilleur global.
            offer = (
                line_offer_override.get(line.get("key"))
                or offers_by_component.get(line.get("component_library_id"))
                or {}
            )

            supplier_reference = cls._clean_export_text(
                offer.get("supplier_part")
                or line.get("supplier_code")
                or offer.get("mpn")
                or line.get("component_mpn")
            )
            supplier_label = cls._supplier_label(
                offer.get("supplier"), defaults.get("default_supplier")
            )
            product_url = cls._clean_export_text(offer.get("product_url") or line.get("supplier_link"))
            # Quantité à commander = override manuel, sinon besoin − stock réel disponible.
            # On n'exporte QUE les lignes à commander (> 0) : les composants couverts par
            # le stock sont exclus du fichier ERP (choix Eric 2026-07-09).
            override_qty = overrides.get(line.get("key"))
            if override_qty is not None:
                export_quantity = int(override_qty or 0)
            else:
                besoin = int(line.get("quantity") or 0)
                stock_available = line.get("stock_available")
                export_quantity = besoin if stock_available is None else max(besoin - int(stock_available), 0)
            if export_quantity <= 0:
                continue

            rows.append(
                {
                    "Référence fournisseur": supplier_reference,
                    "Fournisseur": supplier_label,
                    "Description": cls._build_description(line, offer),
                    "Lien web": product_url,
                    # Référence KT : champ interne société, rempli à la main dans
                    # l'ERP — toujours vide à l'export (demande Eric 2026-06-06,
                    # remplace le mapping COMPONENTS.reference de l'audit §6.2).
                    "Référence KT": "",
                    "Quantité": export_quantity,
                    "Unité": cls._clean_export_text(defaults.get("unit")),
                    "Projet": cls._clean_export_text(defaults.get("project")),
                    "Demandeur": cls._clean_export_text(defaults.get("requester")),
                    "Validateur": cls._clean_export_text(defaults.get("validator")),
                    "Délai": cls._clean_export_text(defaults.get("delay")),
                    "Remarques": cls._clean_export_text(defaults.get("remark")),
                }
            )

        return rows

    @classmethod
    def export_command_erp_workbook(
        cls,
        db: Session,
        command_id: int,
        defaults: Dict[str, str],
        sort_strategy: str = "cheapest",
        priority_supplier: Optional[str] = None,
        line_overrides: Optional[Dict[str, int]] = None,
    ) -> Tuple[BytesIO, str]:
        """Build the ERP purchase-list workbook for a command.

        ``defaults`` carries the ERP context (project, unit, requester, validator,
        delay, remark, default_supplier). Supplier columns are filled from the
        retained offer per component (cached), per the chosen sort strategy.
        """
        from .supplier_offer_service import SupplierOfferService  # avoid import cycle

        summary = CommandService.get_command_summary(db=db, command_id=command_id)

        component_quantities = {
            line["component_library_id"]: line.get("quantity") or 1
            for line in summary.get("aggregated_components", [])
            if line.get("component_library_id")
        }
        offers_by_component = SupplierOfferService.best_offers_for_components(
            db,
            component_quantities,
            strategy=sort_strategy,
            priority_supplier=priority_supplier,
        )

        # Feature B : offre du fournisseur explicitement choisi par ligne (prix live).
        from ..models.commands import CommandLineDetail  # évite un cycle d'import

        selected_by_key = {
            detail.line_key: (detail.selected_supplier or "").upper()
            for detail in db.query(CommandLineDetail)
            .filter(CommandLineDetail.command_id == command_id)
            .all()
            if (detail.selected_supplier or "").strip()
        }
        line_offer_override: Dict[str, Dict] = {}
        if selected_by_key:
            raw_offers = SupplierOfferService.get_offers(db, list(component_quantities.keys()))
            for line in summary.get("aggregated_components", []):
                supplier = selected_by_key.get(line.get("key"))
                component_id = line.get("component_library_id")
                if not supplier or not component_id:
                    continue
                match = next(
                    (
                        offer
                        for offer in raw_offers.get(component_id, [])
                        if (offer.get("supplier") or "").upper() == supplier
                    ),
                    None,
                )
                if match:
                    line_offer_override[line.get("key")] = match

        workbook = Workbook()
        worksheet = workbook.active
        worksheet.title = "Purchase List ERP"
        worksheet.append(cls.ERP_HEADERS)

        for row in cls._build_erp_export_rows(
            command_summary=summary,
            defaults=defaults,
            offers_by_component=offers_by_component,
            line_overrides=line_overrides,
            line_offer_override=line_offer_override,
        ):
            worksheet.append([row[header] for header in cls.ERP_HEADERS])

        buffer = BytesIO()
        workbook.save(buffer)
        buffer.seek(0)
        safe_name = "".join(char if char.isalnum() or char in ("-", "_") else "_" for char in summary["name"]).strip("_")
        filename = f"{safe_name or 'purchase_list'}_ERP.xlsx"
        return buffer, filename
