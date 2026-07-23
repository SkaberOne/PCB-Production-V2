"""Machine production planning helpers."""

import json
import logging
from datetime import datetime
from typing import Dict, List, Optional, Tuple

from sqlalchemy.orm import Session, joinedload

from ..database import utcnow
from ..models.bom import BomItem, BomRevision, Component
from ..models.commands import PlanAssignment, ProductionPlan
from ..models.machines import PnpCart, PnpMachine, PnpManualPlacement, PnpSlotPin
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
from ..utils.nozzles import (
    available_nozzle_types,
    clamp_nozzle_type,
    deduce_nozzle_type,
    normalize_nozzle_layout,
    nozzle_layout_red_positions,
    nozzle_reach_columns,
)

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

        # Types de nozzles réellement montés sur la tête (layout machine ; défaut
        # 503/504/505). Sert à BORNER le type déduit : un boîtier qui déduit un
        # type absent (ex. 0603 → 502) est ramené au plus petit type disponible.
        machine_nozzle_layout_raw = None
        if machine.nozzle_layout:
            try:
                machine_nozzle_layout_raw = json.loads(machine.nozzle_layout)
            except (TypeError, ValueError):
                machine_nozzle_layout_raw = None
        machine_available_nozzles = available_nozzle_types(
            machine_nozzle_layout_raw if isinstance(machine_nozzle_layout_raw, list) else None
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

        # Buckets de pose manuelle (init ici : alimentés en étape 0 puis étape 2).
        manual_placement_components: List[Dict] = []
        manual_placement_ids: set = set()
        manual_placement_slot_savings = 0

        # 0) Composants FORCÉS en pose à la main (choix utilisateur) → PRIORITAIRES :
        #    exclus de la PnP et listés en « à placer à la main » (forced_manual), même
        #    s'ils n'ont PAS de taille de feeder (connecteurs, boutons...). Doit passer
        #    AVANT le routage « taille manquante » sinon un composant sans taille serait
        #    happé par « à compléter » et le forçage resterait sans effet visible.
        forced_manual_ids = cls._load_forced_manual(db, machine_id, production_id)

        def _route_forced_manual(entries: List[Dict], placement_group: str) -> List[Dict]:
            placeable_entries: List[Dict] = []
            for entry in entries:
                if entry["component"].id in forced_manual_ids:
                    payload = build_unassigned_payload(
                        entry, "Pose à la main (forcée)", placement_group, machine_available_nozzles,
                    )
                    payload["manual_placement"] = True
                    payload["forced_manual"] = True
                    manual_placement_components.append(payload)
                    manual_placement_ids.add(entry["component"].id)
                else:
                    placeable_entries.append(entry)
            return placeable_entries

        fixed_entries = _route_forced_manual(fixed_entries, "FIXED")
        dynamic_entries = _route_forced_manual(dynamic_entries, "DYNAMIC")

        # 0bis) Composants SANS taille de feeder exploitable (et NON forcés) → jamais
        #       installés sur la PnP : bascule auto en pose manuelle, signalés
        #       (needs_feeder_size) pour proposer de compléter la taille puis recalculer.
        def _route_missing_feeder_size(entries: List[Dict], placement_group: str) -> List[Dict]:
            placeable_entries: List[Dict] = []
            for entry in entries:
                if entry["feeder_size_mm"] is None:
                    payload = build_unassigned_payload(
                        entry,
                        "Taille de feeder manquante - a completer dans la Base de donnees",
                        placement_group,
                        machine_available_nozzles,
                    )
                    payload["manual_placement"] = True
                    payload["needs_feeder_size"] = True
                    manual_placement_components.append(payload)
                    manual_placement_ids.add(entry["component"].id)
                else:
                    placeable_entries.append(entry)
            return placeable_entries

        fixed_entries = _route_missing_feeder_size(fixed_entries, "FIXED")
        dynamic_entries = _route_missing_feeder_size(dynamic_entries, "DYNAMIC")

        missing_feeder_size_count = sum(
            1 for component in manual_placement_components if component.get("needs_feeder_size")
        )
        forced_manual_count = sum(
            1 for component in manual_placement_components if component.get("forced_manual")
        )

        total_positions = int(machine.num_positions or 0)
        # Le banc = deux rampes (avant/arrière), chacune de `front_cols` colonnes
        # numérotées de GAUCHE (1) à DROITE. Position linéaire : avant = colonne,
        # arrière = front_cols + colonne.
        front_cols = (total_positions + 1) // 2
        back_cols = total_positions - front_cols
        ramp_cols = {"front": front_cols, "back": back_cols}
        ramp_base = {"front": 0, "back": front_cols}

        # Épinglages manuels (globaux) : {component_id: slot_position}.
        pins_by_component = cls._load_slot_pins(db, machine_id, production_id)

        def _entry_nozzle_type(entry: Dict) -> int:
            component = entry["component"]
            deduced = deduce_nozzle_type(
                component.footprint_pnp or component.package, entry["feeder_size_mm"]
            )
            return clamp_nozzle_type(deduced, machine_available_nozzles) or 0

        def _size_invalid_reason(entry: Dict):
            feeder_size_mm = entry["feeder_size_mm"]
            if not machine_feeder_sizes:
                return None
            if feeder_size_mm is None:
                return "Taille de feeder inconnue"
            if feeder_size_mm not in machine_feeder_sizes:
                return f"Taille {feeder_size_mm} mm non disponible sur cette machine"
            return None

        # 1) Tailles de feeder non disponibles → non assignables.
        placeable_fixed: List[Dict] = []
        placeable_dynamic: List[Dict] = []
        for entry in fixed_entries:
            reason = _size_invalid_reason(entry)
            if reason:
                unassigned_components.append(build_unassigned_payload(entry, reason, "FIXED", machine_available_nozzles))
            else:
                placeable_fixed.append(entry)
        for entry in dynamic_entries:
            reason = _size_invalid_reason(entry)
            if reason:
                unassigned_components.append(build_unassigned_payload(entry, reason, "DYNAMIC", machine_available_nozzles))
            else:
                placeable_dynamic.append(entry)

        # 2) Débordement capacité → sélection « à placer à la main » (dynamiques
        #    seulement ; les fixes restent prioritairement montés). Logique inchangée.
        fixed_slot_demand = sum(int(entry["slot_usage"]) for entry in placeable_fixed)
        remaining_capacity = max(total_positions - fixed_slot_demand, 0)
        dynamic_slot_demand = sum(int(entry["slot_usage"]) for entry in placeable_dynamic)

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
                placeable_dynamic,
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
                manual_component = build_unassigned_payload(entry, "A placer a la main (capacite optimisee)", "MANUAL", machine_available_nozzles)
                manual_component["manual_placement"] = True
                manual_component["manual_score"] = round(
                    int(entry["slot_usage"]) / max(int(entry["total_quantity"]), 1), 3
                )
                manual_placement_components.append(manual_component)

        # 3) Placement BILATÉRAL par rampe. Règles métier :
        #    - rampe préférée selon le groupe : fixé→ARRIÈRE, dynamique→AVANT
        #      (repli sur l'autre rampe si la préférée est pleine) ;
        #    - PETITS feeders (1 position) collés au BORD GAUCHE, remplis vers
        #      l'intérieur ; GROS feeders (>8 mm ⇒ 2 positions) collés au BORD
        #      DROIT, remplis vers l'intérieur ; positions libres au milieu ;
        #    - tri par type de nozzle CROISSANT conservé dans chaque bloc (petits
        #      nozzles à gauche, gros à droite) → portée des têtes garantie.
        to_place = list(placeable_fixed) + [
            entry for entry in placeable_dynamic if entry["component"].id not in manual_placement_ids
        ]
        placement_group_by_id = {
            entry["component"].id: ("FIXED" if bool(entry["component"].is_fixed_feeder) else "DYNAMIC")
            for entry in to_place
        }

        def _is_big(entry: Dict) -> bool:
            # Gros feeder = largeur > 8 mm ⇒ occupe 2 positions.
            return int(entry["slot_usage"]) >= 2

        def _placement_sort_key(entry: Dict) -> Tuple:
            return (
                _entry_nozzle_type(entry),
                int(entry["feeder_size_mm"] or 0),
                int(entry["slot_usage"]),
                -int(entry["total_quantity"]),
                component_display_label(entry["component"]).upper(),
                entry["component"].id,
            )

        occupied: set = set()

        def _ramp_of(position: int) -> str:
            return "front" if position <= front_cols else "back"

        def _pin_positions(slot: int, required: int):
            """Positions linéaires d'un épinglage (même rampe + dans les bornes), ou None."""
            if slot < 1 or slot > total_positions:
                return None
            ramp = _ramp_of(slot)
            block = [slot + offset for offset in range(required)]
            for position in block:
                if position < 1 or position > total_positions or _ramp_of(position) != ramp:
                    return None
            return block

        def _commit(entry: Dict, slot_positions: List[int], placement_group: str) -> Dict:
            assignment = build_assignment_payload(
                entry=entry,
                slot_positions=slot_positions,
                placement_group=placement_group,
                assignment_index=len(slot_assignments) + 1,
                ordered_boms=ordered_boms,
                available_nozzle_types=machine_available_nozzles,
            )
            slot_assignments.append(assignment)
            for position in slot_positions:
                positions[position] = assignment
                occupied.add(position)
            return assignment

        # 3.0) Épinglages : placer d'abord les composants épinglés à leur slot.
        pinned_ids: set = set()
        for entry in to_place:
            component_id = entry["component"].id
            slot = pins_by_component.get(component_id)
            if slot is None:
                continue
            pinned_ids.add(component_id)
            placement_group = placement_group_by_id[component_id]
            block = _pin_positions(int(slot), int(entry["slot_usage"]))
            if block is None or any(position in occupied for position in block):
                # Défensif : épinglage devenu invalide (la création est validée en amont).
                payload = build_unassigned_payload(
                    entry,
                    f"Épinglage au slot {slot} invalide (conflit ou hors rampe)",
                    placement_group,
                    machine_available_nozzles,
                )
                payload["pin_conflict"] = True
                unassigned_components.append(payload)
                continue
            assignment = _commit(entry, block, placement_group)
            assignment["is_pinned"] = True
            assignment["pinned_slot"] = int(slot)

        # 3) Placement BILATÉRAL auto des composants NON épinglés, en contournant les
        #    positions déjà occupées par les épinglages.
        #    - PETITS feeders (1 position) collés au BORD GAUCHE, remplis vers l'intérieur ;
        #    - GROS feeders (2 positions) collés au BORD DROIT, remplis vers l'intérieur ;
        #    - rampe préférée : fixé→ARRIÈRE, dynamique→AVANT (repli sur l'autre).
        small_entries = sorted(
            (e for e in to_place if not _is_big(e) and e["component"].id not in pinned_ids),
            key=_placement_sort_key,
        )
        big_entries = sorted(
            (e for e in to_place if _is_big(e) and e["component"].id not in pinned_ids),
            key=_placement_sort_key, reverse=True,
        )

        left_frontier = {"front": 1, "back": 1}
        right_frontier = {"front": ramp_cols["front"], "back": ramp_cols["back"]}

        def _find_free_block(ramp: str, required: int, side: str):
            cols = ramp_cols[ramp]
            base = ramp_base[ramp]
            if side == "left":
                col = left_frontier[ramp]
                while col + required - 1 <= cols:
                    block = [base + (col + offset) for offset in range(required)]
                    if all(position not in occupied for position in block):
                        return col, block
                    col += 1
            else:
                col = right_frontier[ramp] - required + 1
                while col >= 1:
                    block = [base + (col + offset) for offset in range(required)]
                    if all(position not in occupied for position in block):
                        return col, block
                    col -= 1
            return None, None

        def _try_side(entry: Dict, ramp: str, side: str, placement_group: str) -> bool:
            required = int(entry["slot_usage"])
            col, block = _find_free_block(ramp, required, side)
            if block is None:
                return False
            _commit(entry, block, placement_group)
            if side == "left":
                left_frontier[ramp] = col + required
            else:
                right_frontier[ramp] = col - 1
            return True

        def place_entry(entry: Dict, side: str) -> None:
            placement_group = placement_group_by_id[entry["component"].id]
            preferred = "back" if placement_group == "FIXED" else "front"
            for ramp in (preferred, "front" if preferred == "back" else "back"):
                if _try_side(entry, ramp, side, placement_group):
                    return
            unassigned_components.append(build_unassigned_payload(entry, "Capacite machine insuffisante", placement_group, machine_available_nozzles))

        for entry in small_entries:
            place_entry(entry, "left")
        for entry in big_entries:
            place_entry(entry, "right")

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
            "missing_feeder_size_count": missing_feeder_size_count,
            "forced_manual_count": forced_manual_count,
            "unmatched_bom_item_count": unmatched_bom_items,
        }

    @classmethod
    def _load_slot_pins(cls, db: Session, machine_id: int, production_id: int) -> Dict[int, int]:
        """Épinglages {component_id: slot_position} pour cette machine+production."""
        rows = (
            db.query(PnpSlotPin)
            .filter(
                PnpSlotPin.machine_id == machine_id,
                PnpSlotPin.production_id == production_id,
            )
            .all()
        )
        return {int(row.component_id): int(row.slot_position) for row in rows}

    @classmethod
    def list_slot_pins(cls, db: Session, machine_id: int, production_id: int) -> List[Dict]:
        rows = (
            db.query(PnpSlotPin)
            .filter(
                PnpSlotPin.machine_id == machine_id,
                PnpSlotPin.production_id == production_id,
            )
            .all()
        )
        return [
            {"component_id": int(row.component_id), "slot_position": int(row.slot_position)}
            for row in rows
        ]

    @classmethod
    def set_slot_pin(
        cls,
        db: Session,
        machine_id: int,
        production_id: int,
        component_id: int,
        slot_position: int,
    ) -> Dict:
        """Épingle un composant à un slot. Refuse (ValueError) en cas de conflit :
        hors plage, chevauchement de rampe (gros feeder au bord), slot déjà pris par
        un autre épinglage, ou incompatibilité nozzle. Renvoie le plan recalculé."""
        machine, _production = cls._get_machine_and_production_context(
            db=db, machine_id=machine_id, production_id=production_id, include_items=False,
        )
        component = db.query(Component).filter(Component.id == component_id).first()
        if not component:
            raise ValueError(f"Composant {component_id} introuvable.")

        total_positions = int(machine.num_positions or 0)
        slot = int(slot_position)
        if slot < 1 or slot > total_positions:
            raise ValueError(f"Slot {slot} hors plage (1..{total_positions}).")

        front_cols = (total_positions + 1) // 2

        def ramp_of(position: int) -> str:
            return "front" if position <= front_cols else "back"

        required = component_slot_usage(component)
        block = [slot + offset for offset in range(required)]
        for position in block:
            if position < 1 or position > total_positions or ramp_of(position) != ramp_of(slot):
                raise ValueError(
                    f"Le slot {slot} ne peut pas accueillir ce feeder de {required} position(s) : "
                    f"trop proche du bord de la rampe (chevauchement)."
                )

        # Conflit avec un autre composant déjà épinglé.
        existing_pins = (
            db.query(PnpSlotPin)
            .filter(
                PnpSlotPin.machine_id == machine_id,
                PnpSlotPin.production_id == production_id,
                PnpSlotPin.component_id != component_id,
            )
            .all()
        )
        _pin_component_ids = [pin.component_id for pin in existing_pins]
        _pin_components = {
            c.id: c
            for c in db.query(Component).filter(Component.id.in_(_pin_component_ids)).all()
        } if _pin_component_ids else {}
        occupied_by: Dict[int, int] = {}
        for pin in existing_pins:
            other = _pin_components.get(pin.component_id)
            other_usage = component_slot_usage(other) if other else 1
            for offset in range(other_usage):
                occupied_by[int(pin.slot_position) + offset] = int(pin.component_id)
        for position in block:
            if position in occupied_by:
                raise ValueError(f"Slot {position} déjà pris par un autre composant épinglé.")

        # Compatibilité nozzle (uniquement si la tête est configurée).
        num_nozzles = int(machine.num_nozzles or 0)
        if num_nozzles > 0:
            columns_per_ramp = (total_positions + 1) // 2
            raw_layout = None
            if machine.nozzle_layout:
                try:
                    raw_layout = json.loads(machine.nozzle_layout)
                except (TypeError, ValueError):
                    raw_layout = None
            layout = normalize_nozzle_layout(
                raw_layout if isinstance(raw_layout, list) else None, num_nozzles,
            )
            available = available_nozzle_types(layout)
            nozzle_type = clamp_nozzle_type(
                deduce_nozzle_type(
                    component.footprint_pnp or component.package,
                    extract_feeder_size_mm(component.feeder_type),
                ),
                available,
            )
            if nozzle_type:
                column = slot if slot <= columns_per_ramp else slot - columns_per_ramp
                positions_of_type = [
                    index for index, value in enumerate(layout[:num_nozzles], start=1)
                    if int(value) == int(nozzle_type)
                ]
                reachable = False
                for index in positions_of_type:
                    span = nozzle_reach_columns(index, num_nozzles, columns_per_ramp)
                    if span and span[0] <= column <= span[1]:
                        reachable = True
                        break
                if not positions_of_type or not reachable:
                    raise ValueError(
                        f"Slot {slot} incompatible avec l'emplacement nozzle "
                        f"(nozzle type {nozzle_type} indisponible ou hors de portée pour cette colonne)."
                    )

        pin = (
            db.query(PnpSlotPin)
            .filter(
                PnpSlotPin.machine_id == machine_id,
                PnpSlotPin.production_id == production_id,
                PnpSlotPin.component_id == component_id,
            )
            .first()
        )
        if pin:
            pin.slot_position = slot
        else:
            db.add(PnpSlotPin(
                machine_id=machine_id,
                production_id=production_id,
                component_id=component_id,
                slot_position=slot,
            ))
        db.commit()
        return cls.get_machine_production_feeder_plan(
            db=db, machine_id=machine_id, production_id=production_id,
        )

    @classmethod
    def clear_slot_pin(
        cls,
        db: Session,
        machine_id: int,
        production_id: int,
        component_id: int,
    ) -> Dict:
        db.query(PnpSlotPin).filter(
            PnpSlotPin.machine_id == machine_id,
            PnpSlotPin.production_id == production_id,
            PnpSlotPin.component_id == component_id,
        ).delete()
        db.commit()
        return cls.get_machine_production_feeder_plan(
            db=db, machine_id=machine_id, production_id=production_id,
        )

    @classmethod
    def _load_forced_manual(cls, db: Session, machine_id: int, production_id: int) -> set:
        """Ensemble des component_id forcés en pose à la main pour cette machine+production."""
        rows = (
            db.query(PnpManualPlacement)
            .filter(
                PnpManualPlacement.machine_id == machine_id,
                PnpManualPlacement.production_id == production_id,
            )
            .all()
        )
        return {int(row.component_id) for row in rows}

    @classmethod
    def set_manual_placement(
        cls,
        db: Session,
        machine_id: int,
        production_id: int,
        component_id: int,
        manual: bool,
    ) -> Dict:
        """Force (manual=True) ou retire (manual=False) un composant de la pose à la main.
        Forcer un composant à la main retire un éventuel épinglage (incohérent). Renvoie
        le plan recalculé."""
        cls._get_machine_and_production_context(
            db=db, machine_id=machine_id, production_id=production_id, include_items=False,
        )
        existing = (
            db.query(PnpManualPlacement)
            .filter(
                PnpManualPlacement.machine_id == machine_id,
                PnpManualPlacement.production_id == production_id,
                PnpManualPlacement.component_id == component_id,
            )
            .first()
        )
        if manual and not existing:
            db.add(PnpManualPlacement(
                machine_id=machine_id, production_id=production_id, component_id=component_id,
            ))
            # Un composant à la main ne peut pas être épinglé à un slot.
            db.query(PnpSlotPin).filter(
                PnpSlotPin.machine_id == machine_id,
                PnpSlotPin.production_id == production_id,
                PnpSlotPin.component_id == component_id,
            ).delete()
        elif not manual and existing:
            db.query(PnpManualPlacement).filter(
                PnpManualPlacement.machine_id == machine_id,
                PnpManualPlacement.production_id == production_id,
                PnpManualPlacement.component_id == component_id,
            ).delete()
        db.commit()
        return cls.get_machine_production_feeder_plan(
            db=db, machine_id=machine_id, production_id=production_id,
        )

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
        machine = db.query(PnpMachine).filter(PnpMachine.id == machine_id).first()
        if not machine:
            raise ValueError(f"Machine {machine_id} not found")

        plan = db.query(ProductionPlan).filter(ProductionPlan.id == plan_id).first()
        if not plan:
            raise ValueError(f"Production plan {plan_id} not found")

        num_assignments = (
            db.query(PlanAssignment)
            .filter(PlanAssignment.production_plan_id == plan_id)
            .count()
        )
        positions = machine.num_positions or 0
        has_capacity = num_assignments <= positions

        return {
            "machine_id": machine_id,
            "plan_id": plan_id,
            "machine_positions": positions,
            "assigned_positions": num_assignments,
            "available_positions": positions - num_assignments,
            "has_capacity": has_capacity,
            "capacity_utilization": (
                round((num_assignments / positions) * 100, 2) if positions else 0.0
            ),
        }
