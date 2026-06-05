"""Machine production planning helpers."""

import json
import logging
from datetime import datetime
from typing import Dict, List, Tuple

from sqlalchemy.orm import Session, joinedload

from ..database import utcnow
from ..models.bom import BomItem, BomRevision, Component
from ..models.commands import ProductionPlan
from ..models.machines import PnpCart, PnpMachine
from ..models.production import Production, ProductionBomRevision
from .assignment_helpers import (
    build_assignment_payload,
    build_bom_assignment_summaries,
    build_slot_payload,
    build_unassigned_payload,
    cart_kind_value,
    component_display_label,
    component_slot_usage,
    extract_feeder_size_mm,
    serialize_machine,
    serialize_machine_production,
    sort_production_bom_links,
)
from .component_library_service import ComponentLibraryService
from ..utils.nozzles import normalize_nozzle_layout, nozzle_layout_red_positions

logger = logging.getLogger(__name__)


class AssignmentPlanningMixin:
    """Helpers for machine-to-production planning and validation."""

    @classmethod
    def _get_machine_with_relations(cls, db: Session, machine_id: int) -> PnpMachine:
        machine = (
            db.query(PnpMachine)
            .options(
                joinedload(PnpMachine.feeders),
                joinedload(PnpMachine.production_plans),
                joinedload(PnpMachine.productions)
                .joinedload(Production.bom_links)
                .joinedload(ProductionBomRevision.revision)
                .joinedload(BomRevision.reference),
            )
            .filter(PnpMachine.id == machine_id)
            .first()
        )
        if not machine:
            raise ValueError(f"Machine {machine_id} not found")
        return machine

    @classmethod
    def _get_machine_and_production_context(
        cls,
        db: Session,
        machine_id: int,
        production_id: int,
        include_items: bool = False,
    ) -> Tuple[PnpMachine, Production]:
        machine = (
            db.query(PnpMachine)
            .options(joinedload(PnpMachine.feeders))
            .filter(PnpMachine.id == machine_id)
            .first()
        )
        if not machine:
            raise ValueError(f"Machine {machine_id} not found")

        production_options = [
            joinedload(Production.bom_links)
            .joinedload(ProductionBomRevision.revision)
            .joinedload(BomRevision.reference),
        ]
        if include_items:
            production_options.append(
                joinedload(Production.bom_links)
                .joinedload(ProductionBomRevision.revision)
                .joinedload(BomRevision.items)
            )

        production = (
            db.query(Production)
            .options(*production_options)
            .filter(Production.id == production_id)
            .first()
        )
        if not production:
            raise ValueError(f"Production {production_id} not found")
        if production.machine_id != machine_id:
            raise ValueError(f"Production {production_id} is not assigned to machine {machine_id}")
        return machine, production

    @classmethod
    def update_machine_production_bom_order(
        cls,
        db: Session,
        machine_id: int,
        production_id: int,
        bom_revision_ids: List[int],
    ) -> Dict:
        _machine, production = cls._get_machine_and_production_context(
            db=db,
            machine_id=machine_id,
            production_id=production_id,
            include_items=False,
        )

        normalized_revision_ids = [int(revision_id) for revision_id in bom_revision_ids if revision_id]
        if not normalized_revision_ids:
            raise ValueError("At least one BOM revision must be provided")

        current_links = {link.bom_revision_id: link for link in production.bom_links}
        current_revision_ids = set(current_links.keys())
        requested_revision_ids = set(normalized_revision_ids)
        if current_revision_ids != requested_revision_ids:
            missing_ids = sorted(current_revision_ids - requested_revision_ids)
            extra_ids = sorted(requested_revision_ids - current_revision_ids)
            details = []
            if missing_ids:
                details.append("missing: " + ", ".join(str(revision_id) for revision_id in missing_ids))
            if extra_ids:
                details.append("unknown: " + ", ".join(str(revision_id) for revision_id in extra_ids))
            raise ValueError("BOM order must include exactly the linked BOM revisions (" + "; ".join(details) + ")")

        for index, revision_id in enumerate(normalized_revision_ids, start=1):
            current_links[revision_id].sequence_order = index

        production.manufacturing_order_validated_at = None
        production.updated_at = utcnow()
        db.commit()
        db.refresh(production)
        return serialize_machine_production(production)

    @classmethod
    def _collect_machine_production_usage(
        cls,
        db: Session,
        production: Production,
        only_bom_revision_id: Optional[int] = None,
    ) -> Tuple[List[Dict], Dict[int, Dict], int]:
        # only_bom_revision_id : si fourni, on ne collecte QUE cette face (TOP/BOT),
        # pour un plan d'implantation recalculé pour cette face seule.
        ordered_links = sort_production_bom_links(production.bom_links)
        quantity_to_produce_by_revision: Dict[int, int] = {
            int(link.bom_revision_id): max(int(link.quantity_to_produce or 1), 1)
            for link in ordered_links
            if int(link.bom_revision_id or 0) > 0
        }

        components = (
            db.query(Component)
            .options(joinedload(Component.fixed_cart))
            .order_by(Component.id.asc())
            .all()
        )
        component_lookup = ComponentLibraryService.build_lookup(components)
        usage_index: Dict[int, Dict] = {}
        unmatched_bom_items = 0
        ordered_boms: List[Dict] = []

        for sequence_index, link in enumerate(ordered_links, start=1):
            revision = link.revision
            reference = revision.reference if revision else None
            side = revision.type.value if revision and hasattr(revision.type, "value") else (revision.type if revision else "")
            board_build_key = (
                f"{reference.id}:{revision.revision}"
                if reference and revision
                else f"revision:{revision.id if revision else sequence_index}"
            )
            bom_label = " / ".join(
                part for part in [reference.reference if reference else "", revision.revision if revision else "", side or ""] if part
            )
            ordered_boms.append(
                {
                    "bom_reference_id": reference.id if reference else None,
                    "bom_revision_id": revision.id if revision else None,
                    "reference": reference.reference if reference else "",
                    "category": reference.category if reference else None,
                    "revision": revision.revision if revision else "",
                    "side": side or "",
                    "sequence_order": link.sequence_order or sequence_index,
                    "label": bom_label,
                    "board_build_key": board_build_key,
                    "quantity_to_produce": quantity_to_produce_by_revision.get(revision.id, 1) if revision else 1,
                }
            )

            if not revision:
                continue

            # Plan par face : on garde TOUTES les faces dans ordered_boms (sélecteur
            # UI complet) mais on ne collecte l'usage que pour la face sélectionnée.
            if only_bom_revision_id is not None and revision.id != only_bom_revision_id:
                continue

            revision_quantity_to_produce = quantity_to_produce_by_revision.get(revision.id, 1)
            if revision_quantity_to_produce < 1:
                continue

            for bom_item in list(revision.items or []):
                if bom_item.dnp:
                    continue

                matched_component = ComponentLibraryService.match_bom_item(component_lookup, bom_item)
                if not matched_component:
                    unmatched_bom_items += 1
                    continue

                usage_entry = usage_index.setdefault(
                    matched_component.id,
                    {
                        "component": matched_component,
                        "slot_usage": component_slot_usage(matched_component),
                        "feeder_size_mm": extract_feeder_size_mm(matched_component.feeder_type),
                        "bom_revision_ids": set(),
                        "bom_labels_by_revision": {},
                        "total_quantity": 0,
                        "board_quantity_by_revision": {},
                        "total_quantity_by_revision": {},
                        "build_quantity_by_board_key": {},
                        "first_bom_index": sequence_index,
                        "last_bom_index": sequence_index,
                    },
                )
                bom_item_board_quantity = max(int(bom_item.quantity or 1), 1)
                usage_entry["bom_revision_ids"].add(revision.id)
                usage_entry["bom_labels_by_revision"][revision.id] = bom_label
                usage_entry["board_quantity_by_revision"][revision.id] = (
                    usage_entry["board_quantity_by_revision"].get(revision.id, 0) + bom_item_board_quantity
                )
                usage_entry["total_quantity_by_revision"][revision.id] = (
                    usage_entry["total_quantity_by_revision"].get(revision.id, 0)
                    + (bom_item_board_quantity * revision_quantity_to_produce)
                )
                usage_entry["build_quantity_by_board_key"][board_build_key] = revision_quantity_to_produce
                usage_entry["total_quantity"] += bom_item_board_quantity * revision_quantity_to_produce
                usage_entry["first_bom_index"] = min(usage_entry["first_bom_index"], sequence_index)
                usage_entry["last_bom_index"] = max(usage_entry["last_bom_index"], sequence_index)

        return ordered_boms, usage_index, unmatched_bom_items

    @classmethod
    def _collect_machine_queue_reuse(cls, db: Session, machine) -> Dict[int, int]:
        """Compte, pour chaque composant, le nombre de FACES distinctes (révisions
        BOM) qui l'utilisent sur TOUTE la file de la machine : faces de la prod en
        cours + faces des autres productions affectées à la machine.

        Sert à l'optimisation inter-productions : un composant réutilisé par
        beaucoup de faces (réutilisation élevée) doit rester monté ; les feeders
        propres à une seule face (réutilisation faible) sont les premiers candidats
        à la pose « à la main » quand la capacité est dépassée.
        """
        reuse_faces: Dict[int, set] = {}
        for production in list(machine.productions or []):
            try:
                _, usage_index, _ = cls._collect_machine_production_usage(db=db, production=production)
            except Exception:  # noqa: BLE001 — une prod incohérente ne doit pas casser le plan
                continue
            for component_id, entry in usage_index.items():
                faces = reuse_faces.setdefault(component_id, set())
                for revision_id in entry["bom_revision_ids"]:
                    faces.add((production.id, revision_id))
        return {component_id: len(faces) for component_id, faces in reuse_faces.items()}

    @classmethod
    def _fixed_plan_sort_key(cls, entry: Dict) -> Tuple:
        component = entry["component"]
        cart = component.fixed_cart
        kind_priority = {
            PnpCart.KindEnum.COMMON.value: 0,
            PnpCart.KindEnum.CATEGORY.value: 1,
            PnpCart.KindEnum.CUSTOM.value: 2,
        }
        cart_kind = cart_kind_value(cart) or PnpCart.KindEnum.CUSTOM.value
        return (
            kind_priority.get(cart_kind, 99),
            -entry["slot_usage"],
            (cart.name if cart else "").upper(),
            -len(entry["bom_revision_ids"]),
            entry["first_bom_index"],
            component_display_label(component).upper(),
            component.id,
        )

    @classmethod
    def _dynamic_plan_sort_key(cls, entry: Dict) -> Tuple:
        component = entry["component"]
        bom_span = entry["last_bom_index"] - entry["first_bom_index"]
        return (
            -len(entry["bom_revision_ids"]),
            -bom_span,
            entry["first_bom_index"],
            -entry["slot_usage"],
            -entry["total_quantity"],
            component_display_label(component).upper(),
            component.id,
        )

    @classmethod
    def get_machine_production_feeder_plan(
        cls,
        db: Session,
        machine_id: int,
        production_id: int,
        bom_revision_id: Optional[int] = None,
    ) -> Dict:
        machine, production = cls._get_machine_and_production_context(
            db=db,
            machine_id=machine_id,
            production_id=production_id,
            include_items=True,
        )

        ordered_links = sort_production_bom_links(production.bom_links)
        for index, link in enumerate(ordered_links, start=1):
            if link.sequence_order != index:
                link.sequence_order = index
        db.flush()

        ordered_boms, usage_index, unmatched_bom_items = cls._collect_machine_production_usage(
            db=db, production=production, only_bom_revision_id=bom_revision_id,
        )
        # Réutilisation inter-productions : nb de faces de la file machine qui
        # utilisent chaque composant (≥1). Sert à garder montés les feeders
        # réutilisés et à sortir « à la main » d'abord les feeders propres à une face.
        queue_reuse = cls._collect_machine_queue_reuse(db=db, machine=machine)
        total_build_quantity_by_board_key: Dict[str, int] = {}
        for bom in ordered_boms:
            board_build_key = str(bom.get("board_build_key") or "")
            if not board_build_key:
                continue
            total_build_quantity_by_board_key[board_build_key] = max(
                total_build_quantity_by_board_key.get(board_build_key, 0),
                max(int(bom.get("quantity_to_produce") or 1), 1),
            )
        total_build_quantity = sum(total_build_quantity_by_board_key.values())
        machine_feeder_sizes = sorted(
            {
                int(feeder.size_mm)
                for feeder in list(machine.feeders or [])
                if feeder.size_mm is not None
            }
        )

        fixed_entries: List[Dict] = []
        dynamic_entries: List[Dict] = []
        for entry in usage_index.values():
            component = entry["component"]
            if bool(component.is_fixed_feeder):
                fixed_entries.append(entry)
            else:
                dynamic_entries.append(entry)

        positions: Dict[int, Dict] = {}
        slot_assignments: List[Dict] = []
        unassigned_components: List[Dict] = []

        def assign_entry(entry: Dict, placement_group: str, from_back: bool = False) -> None:
            feeder_size_mm = entry["feeder_size_mm"]
            if machine_feeder_sizes:
                if feeder_size_mm is None:
                    unassigned_components.append(build_unassigned_payload(entry, "Taille de feeder inconnue", placement_group))
                    return
                if feeder_size_mm not in machine_feeder_sizes:
                    unassigned_components.append(
                        build_unassigned_payload(
                            entry,
                            f"Taille {feeder_size_mm} mm non disponible sur cette machine",
                            placement_group,
                        )
                    )
                    return

            required_slots = entry["slot_usage"]
            total_positions = int(machine.num_positions or 0)
            start_range = range(1, max(total_positions - required_slots + 2, 1))
            # Feeders fixes : remplissage depuis l'arrière (positions hautes) pour les
            # regrouper sur la rampe arrière ; dynamiques depuis l'avant (positions
            # basses) afin de maximiser les feeders mobiles sur la rampe avant.
            slot_starts = reversed(start_range) if from_back else start_range
            for slot_start in slot_starts:
                slot_positions = list(range(slot_start, slot_start + required_slots))
                if slot_positions[-1] > total_positions:
                    continue
                if any(position in positions for position in slot_positions):
                    continue

                assignment = build_assignment_payload(
                    entry=entry,
                    slot_positions=slot_positions,
                    placement_group=placement_group,
                    assignment_index=len(slot_assignments) + 1,
                    ordered_boms=ordered_boms,
                )
                slot_assignments.append(assignment)
                for position in slot_positions:
                    positions[position] = assignment
                return

            unassigned_components.append(build_unassigned_payload(entry, "Capacite machine insuffisante", placement_group))

        for entry in sorted(fixed_entries, key=cls._fixed_plan_sort_key):
            assign_entry(entry, "FIXED", from_back=True)

        # ── Débordement → sélection « à placer à la main » ─────────────────────────
        # Après les feeders fixes, si la demande dynamique dépasse la capacité
        # restante de la machine, on choisit les composants à poser à la main par
        # score « emplacements libérés ÷ nombre de poses » décroissant : les gros
        # feeders (2 positions) peu posés sortent en premier — un maximum de place
        # gagnée pour un minimum d'effort manuel — jusqu'à ce que le reste tienne.
        manual_placement_components: List[Dict] = []
        manual_placement_slot_savings = 0
        manual_placement_ids: set = set()

        def _dynamic_size_is_valid(candidate: Dict) -> bool:
            feeder_size_mm = candidate["feeder_size_mm"]
            if not machine_feeder_sizes:
                return True
            return feeder_size_mm is not None and feeder_size_mm in machine_feeder_sizes

        size_valid_dynamic = [entry for entry in dynamic_entries if _dynamic_size_is_valid(entry)]
        remaining_capacity = max(int(machine.num_positions or 0) - len(positions), 0)
        dynamic_slot_demand = sum(int(entry["slot_usage"]) for entry in size_valid_dynamic)

        if dynamic_slot_demand > remaining_capacity:
            overflow_slots = dynamic_slot_demand - remaining_capacity
            # Ordre de sortie « à la main » : on sort d'abord (0) les feeders les
            # MOINS réutilisés sur la file de la machine (faces des prochaines
            # productions incluses) — pour garder montés les feeders réutilisés et
            # minimiser les changements ; puis, à réutilisation égale, ceux qui (1)
            # libèrent le plus de place par pose, (2) ont le plus gros boîtier
            # (feeder_size_mm, plus simples à poser à la main, ex SOIC-8), (3)
            # occupent le plus de positions (gros feeder 2 pos), (4) ont le moins
            # de poses — pour minimiser le nombre ET l'effort des poses manuelles.
            ranked_for_manual = sorted(
                size_valid_dynamic,
                key=lambda entry: (
                    int(queue_reuse.get(entry["component"].id, 1)),
                    -(int(entry["slot_usage"]) / max(int(entry["total_quantity"]), 1)),
                    -int(entry["feeder_size_mm"] or 0),
                    -int(entry["slot_usage"]),
                    int(entry["total_quantity"]),
                    component_display_label(entry["component"]).upper(),
                    entry["component"].id,
                ),
            )
            for entry in ranked_for_manual:
                if manual_placement_slot_savings >= overflow_slots:
                    break
                manual_placement_ids.add(entry["component"].id)
                manual_placement_slot_savings += int(entry["slot_usage"])
                manual_component = build_unassigned_payload(entry, "A placer a la main (capacite optimisee)", "MANUAL")
                manual_component["manual_placement"] = True
                manual_component["manual_score"] = round(
                    int(entry["slot_usage"]) / max(int(entry["total_quantity"]), 1), 3
                )
                manual_placement_components.append(manual_component)

        for entry in sorted(dynamic_entries, key=cls._dynamic_plan_sort_key):
            if entry["component"].id in manual_placement_ids:
                continue
            assign_entry(entry, "DYNAMIC")

        slots = []
        total_positions = int(machine.num_positions or 0)
        for position in range(1, total_positions + 1):
            slots.append(build_slot_payload(position, positions.get(position)))

        assigned_fixed_count = sum(1 for assignment in slot_assignments if assignment["placement_group"] == "FIXED")
        assigned_dynamic_count = sum(1 for assignment in slot_assignments if assignment["placement_group"] == "DYNAMIC")
        stable_assignment_indexes = [
            assignment["assignment_index"]
            for assignment in slot_assignments
            if assignment["is_stable_between_boms"]
        ]
        bom_assignment_summaries = build_bom_assignment_summaries(ordered_boms, slot_assignments)

        # ── Config nozzles : layout par position + positions en rouge (hors portée) ──
        num_nozzles = int(machine.num_nozzles or 0)
        columns_per_ramp = (total_positions + 1) // 2
        nozzle_layout: List[int] = []
        nozzle_red_positions: List[int] = []
        if num_nozzles > 0 and columns_per_ramp > 0:
            raw_layout = None
            if machine.nozzle_layout:
                try:
                    raw_layout = json.loads(machine.nozzle_layout)
                except (TypeError, ValueError):
                    raw_layout = None
            nozzle_layout = normalize_nozzle_layout(
                raw_layout if isinstance(raw_layout, list) else None, num_nozzles,
            )
            needed_columns_by_type: Dict[int, set] = {}
            for assignment in slot_assignments:
                nozzle_type = assignment.get("nozzle_type")
                if not nozzle_type:
                    continue
                for position in assignment["slot_positions"]:
                    column = position if position <= columns_per_ramp else position - columns_per_ramp
                    needed_columns_by_type.setdefault(int(nozzle_type), set()).add(column)
            nozzle_red_positions = nozzle_layout_red_positions(
                nozzle_layout, needed_columns_by_type, num_nozzles, columns_per_ramp,
            )

        return {
            "machine_id": machine.id,
            "machine_name": machine.name,
            "machine_positions": total_positions,
            "machine_feeder_sizes": machine_feeder_sizes,
            "num_nozzles": num_nozzles,
            "nozzle_layout": nozzle_layout,
            "nozzle_red_positions": nozzle_red_positions,
            "production_id": production.id,
            "production_name": production.name,
            "quantity_source": "PRODUCTION",
            "total_build_quantity": total_build_quantity,
            "manufacturing_order_validated_at": (
                production.manufacturing_order_validated_at.isoformat()
                if production.manufacturing_order_validated_at
                else None
            ),
            "is_order_validated": production.manufacturing_order_validated_at is not None,
            "ordered_boms": ordered_boms,
            "slot_assignments": slot_assignments,
            "stable_assignment_indexes": stable_assignment_indexes,
            "stable_assignment_count": len(stable_assignment_indexes),
            "bom_assignment_summaries": bom_assignment_summaries,
            "slots": slots,
            "unassigned_components": unassigned_components,
            "assigned_component_count": len(slot_assignments),
            "assigned_fixed_component_count": assigned_fixed_count,
            "assigned_dynamic_component_count": assigned_dynamic_count,
            "fixed_candidate_count": len(fixed_entries),
            "dynamic_candidate_count": len(dynamic_entries),
            "occupied_slot_count": len(positions),
            "free_slot_count": max(total_positions - len(positions), 0),
            "unassigned_component_count": len(unassigned_components),
            "manual_placement_components": manual_placement_components,
            "manual_placement_count": len(manual_placement_components),
            "manual_placement_slot_savings": manual_placement_slot_savings,
            "unmatched_bom_item_count": unmatched_bom_items,
        }

    @classmethod
    def validate_machine_production_order(
        cls,
        db: Session,
        machine_id: int,
        production_id: int,
    ) -> Dict:
        _machine, production = cls._get_machine_and_production_context(
            db=db,
            machine_id=machine_id,
            production_id=production_id,
            include_items=False,
        )
        ordered_links = sort_production_bom_links(production.bom_links)
        if not ordered_links:
            raise ValueError("Aucune BOM n'est liee a cette production.")

        for index, link in enumerate(ordered_links, start=1):
            link.sequence_order = index

        production.manufacturing_order_validated_at = utcnow()
        production.updated_at = utcnow()
        db.commit()
        db.refresh(production)

        return {
            "message": "Ordre de fabrication valide. Implantation feeders calculee.",
            "production": serialize_machine_production(production),
            "plan": cls.get_machine_production_feeder_plan(
                db=db,
                machine_id=machine_id,
                production_id=production_id,
            ),
        }

    @staticmethod
    def get_machine_summary(db: Session, machine_id: int) -> Dict:
        machine = AssignmentPlanningMixin._get_machine_with_relations(db=db, machine_id=machine_id)
        active_plans = db.query(ProductionPlan).filter(ProductionPlan.machine_id == machine_id).all()
        machine_summary = serialize_machine(machine)

        feeder_details = [
            {
                "id": feeder.id,
                "size_mm": feeder.size_mm,
                "capacity": feeder.capacity,
                "description": feeder.description,
            }
            for feeder in machine.feeders
        ]
        production_details = [
            serialize_machine_production(production)
            for production in sorted(
                machine.productions or [],
                key=lambda item: item.updated_at or item.created_at or datetime.min,
                reverse=True,
            )
        ]

        return {
            **machine_summary,
            "active_production_plans": len(active_plans),
            "productions": production_details,
            "feeders": feeder_details,
            "production_plans": [
                {
                    "id": plan.id,
                    "command_id": plan.command_id,
                    "created_at": plan.created_at.isoformat(),
                }
                for plan in active_plans
            ],
        }

    @staticmethod
    def check_machine_capacity(
        db: Session,
        machine_id: int,
        plan_id: int,
    ) -> Dict:
        machine = db.query(PnpCart).filter(PnpCart.id == machine_id).first()
        if not machine:
            raise ValueError(f"Machine {machine_id} not found")

        plan = db.query(ProductionPlan).filter(ProductionPlan.id == plan_id).first()
        if not plan:
            raise ValueError(f"Production plan {plan_id} not found")

        assignments = db.query(ProductionPlan).filter(ProductionPlan.id == plan_id).all()
        num_assignments = len(assignments)
        has_capacity = num_assignments <= machine.num_positions

        return {
            "machine_id": machine_id,
            "plan_id": plan_id,
            "machine_positions": machine.num_positions,
            "assigned_positions": num_assignments,
            "available_positions": machine.num_positions - num_assignments,
            "has_capacity": has_capacity,
            "capacity_utilization": round((num_assignments / machine.num_positions) * 100, 2),
        }
