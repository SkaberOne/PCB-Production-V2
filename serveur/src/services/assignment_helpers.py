"""Pure helpers for assignment service serialization and ordering."""

import json
from datetime import datetime
from typing import Dict, List, Optional, Tuple

from ..models.bom import Component
from ..models.machines import PnpCart, PnpMachine
from ..models.production import Production, ProductionBomRevision
from ..utils.feeder_types import (
    extract_component_feeder_size_mm,
    normalize_component_feeder_type,
)
from ..utils.nozzles import deduce_nozzle_type, normalize_nozzle_layout


def _parse_nozzle_layout(raw, num_nozzles):
    """Layout nozzle stocké (JSON) → liste normalisée de longueur num_nozzles
    (complétée par le pré-remplissage par défaut si absent/partiel)."""
    stored = None
    if raw:
        try:
            stored = json.loads(raw)
        except (TypeError, ValueError):
            stored = None
    return normalize_nozzle_layout(stored if isinstance(stored, list) else None, num_nozzles)


def parse_cart_kind(kind: Optional[str]) -> PnpCart.KindEnum:
    normalized = (kind or PnpCart.KindEnum.CUSTOM.value).strip().upper()
    try:
        return PnpCart.KindEnum(normalized)
    except ValueError as exc:
        raise ValueError(f"Unknown cart kind '{kind}'") from exc


def component_slot_usage(component: Component) -> int:
    feeder_size_mm = extract_component_feeder_size_mm(component.feeder_type)
    if feeder_size_mm is not None:
        return 1 if feeder_size_mm <= 8 else 2
    return 1


def extract_feeder_size_mm(feeder_type: Optional[str]) -> Optional[int]:
    return extract_component_feeder_size_mm(feeder_type)


def normalize_category_key(value: Optional[str]) -> Optional[str]:
    normalized = (value or "").strip()
    return normalized.upper() if normalized else None


def serialize_cart(cart: PnpCart) -> Dict:
    linked_components = list(cart.components or [])
    used_positions = sum(component_slot_usage(component) for component in linked_components)
    capacity_positions = cart.capacity_positions or 0

    return {
        "id": cart.id,
        "name": cart.name,
        "kind": cart.kind.value if hasattr(cart.kind, "value") else str(cart.kind),
        "target_category": cart.target_category,
        "capacity_positions": capacity_positions,
        "used_positions": used_positions,
        "remaining_positions": max(capacity_positions - used_positions, 0),
        "fixed_component_count": len(linked_components),
        "description": cart.description,
        "notes": cart.notes,
        "created_at": cart.created_at.isoformat() if cart.created_at else None,
        "updated_at": cart.updated_at.isoformat() if cart.updated_at else None,
    }


def serialize_machine(machine: PnpMachine) -> Dict:
    return {
        "id": machine.id,
        "name": machine.name,
        "num_positions": machine.num_positions,
        "num_nozzles": machine.num_nozzles,
        "nozzle_layout": _parse_nozzle_layout(machine.nozzle_layout, machine.num_nozzles),
        "description": machine.description,
        "notes": machine.notes,
        "created_at": machine.created_at.isoformat() if machine.created_at else None,
        "assigned_feeder_types": len(machine.feeders or []),
        "active_production_plans": len(machine.production_plans or []),
        "assigned_productions": len(machine.productions or []),
    }


def serialize_fixed_feeder_component(component: Component, usage_entry: Optional[Dict] = None) -> Dict:
    quantity_by_reference = usage_entry["quantity_by_reference"] if usage_entry else {}
    bom_reference_count = len(usage_entry["reference_ids"]) if usage_entry else 0
    total_quantity = sum(quantity_by_reference.values()) if quantity_by_reference else 0
    average_board_quantity = round(total_quantity / bom_reference_count, 2) if bom_reference_count else 0.0
    feeder_size_mm = extract_feeder_size_mm(component.feeder_type)
    category_keys = usage_entry["category_keys"] if usage_entry else set()

    return {
        "component_id": component.id,
        "reference": component.reference,
        "value": component.value,
        "mpn": component.mpn,
        "description": component.description,
        "component_label": component.description or component.mpn or component.value or component.reference,
        "footprint_pnp": component.footprint_pnp or component.package,
        "footprint_eagle": component.footprint_eagle,
        "feeder_type": normalize_component_feeder_type(component.feeder_type),
        "feeder_size_mm": feeder_size_mm,
        "slot_usage": component_slot_usage(component),
        "bom_reference_count": bom_reference_count,
        "total_board_quantity": total_quantity,
        "average_board_quantity": average_board_quantity,
        "category_count": len(category_keys),
        "categories": sorted(category_keys),
        "is_fixed_feeder": bool(component.is_fixed_feeder),
        "fixed_cart_id": component.fixed_cart_id,
        "fixed_cart_name": component.fixed_cart.name if component.fixed_cart else None,
        "fixed_cart_kind": cart_kind_value(component.fixed_cart),
        "notes": component.notes,
    }


def fixed_feeder_sort_key(candidate: Dict) -> Tuple:
    component = candidate["component"]
    display_name = component.mpn or component.value or component.reference or ""
    return (
        -candidate["reference_count"],
        candidate["slot_usage"],
        -candidate["usage_quantity"],
        display_name.upper(),
        component.id,
    )


def sort_production_bom_links(links: Optional[List[ProductionBomRevision]]) -> List[ProductionBomRevision]:
    return sorted(
        list(links or []),
        key=lambda link: (
            link.sequence_order if link.sequence_order is not None else 10**9,
            link.added_at or datetime.min,
            link.id or 0,
        ),
    )


def component_display_label(component: Optional[Component]) -> str:
    if not component:
        return "Composant inconnu"
    return component.description or component.mpn or component.value or component.reference or "Composant inconnu"


def cart_kind_value(cart: Optional[PnpCart]) -> Optional[str]:
    if not cart:
        return None
    if hasattr(cart.kind, "value"):
        return cart.kind.value
    return str(cart.kind)


def serialize_machine_production(production: Production) -> Dict:
    ordered_links = sort_production_bom_links(production.bom_links)
    bom_revisions = []
    linked_references = []
    total_boards_to_produce_by_key: Dict[str, int] = {}
    for index, link in enumerate(ordered_links, start=1):
        revision = link.revision
        reference = revision.reference if revision else None
        side = revision.type.value if revision and hasattr(revision.type, "value") else (revision.type if revision else "")
        board_key = (
            f"{reference.id}:{revision.revision}"
            if reference and revision
            else f"link:{link.id or index}"
        )
        total_boards_to_produce_by_key[board_key] = max(
            total_boards_to_produce_by_key.get(board_key, 0),
            max(int(link.quantity_to_produce or 1), 1),
        )
        if reference and reference.reference and reference.reference not in linked_references:
            linked_references.append(reference.reference)
        bom_revisions.append(
            {
                "bom_reference_id": reference.id if reference else None,
                "bom_revision_id": revision.id if revision else None,
                "reference": reference.reference if reference else "",
                "category": reference.category if reference else None,
                "revision": revision.revision if revision else "",
                "side": side or "",
                "file_name": f"{reference.reference}_{side}.txt" if reference and side else "",
                "sequence_order": link.sequence_order or index,
                "quantity_to_produce": max(int(link.quantity_to_produce or 1), 1),
                "added_at": link.added_at.isoformat() if link.added_at else None,
            }
        )

    return {
        "id": production.id,
        "name": production.name,
        "status": production.status.value if hasattr(production.status, "value") else str(production.status),
        "bom_count": len(ordered_links),
        "total_boards_to_produce": sum(total_boards_to_produce_by_key.values()),
        "linked_references": linked_references,
        "updated_at": production.updated_at.isoformat() if production.updated_at else None,
        "manufacturing_order_validated_at": (
            production.manufacturing_order_validated_at.isoformat()
            if production.manufacturing_order_validated_at
            else None
        ),
        "has_validated_order": production.manufacturing_order_validated_at is not None,
        "bom_revisions": bom_revisions,
    }


def build_assignment_payload(
    entry: Dict,
    slot_positions: List[int],
    placement_group: str,
    assignment_index: int,
    ordered_boms: List[Dict],
) -> Dict:
    component = entry["component"]
    bom_presence_count = len(entry["bom_revision_ids"])
    total_build_quantity = sum(entry["build_quantity_by_board_key"].values())
    average_board_quantity = round(entry["total_quantity"] / total_build_quantity, 2) if total_build_quantity else 0.0
    cart = component.fixed_cart
    ordered_bom_revision_ids = [bom["bom_revision_id"] for bom in ordered_boms]
    assignment_bom_revision_ids = [
        bom_revision_id
        for bom_revision_id in ordered_bom_revision_ids
        if bom_revision_id in entry["bom_revision_ids"]
    ]
    is_stable_between_boms = bool(component.is_fixed_feeder) or len(assignment_bom_revision_ids) > 1
    return {
        "assignment_index": assignment_index,
        "slot_start": slot_positions[0],
        "slot_end": slot_positions[-1],
        "slot_positions": slot_positions,
        "placement_group": placement_group,
        "component_id": component.id,
        "component_label": component_display_label(component),
        "component_reference": component.reference,
        "component_value": component.value,
        "component_mpn": component.mpn,
        "footprint_pnp": component.footprint_pnp or component.package,
        "footprint_eagle": component.footprint_eagle,
        "feeder_type": normalize_component_feeder_type(component.feeder_type),
        "feeder_size_mm": entry["feeder_size_mm"],
        "nozzle_type": deduce_nozzle_type(component.footprint_pnp or component.package, entry["feeder_size_mm"]),
        "slot_usage": entry["slot_usage"],
        "bom_presence_count": bom_presence_count,
        "bom_revision_ids": assignment_bom_revision_ids,
        "total_build_quantity": total_build_quantity,
        "total_board_quantity": entry["total_quantity"],
        "average_board_quantity": average_board_quantity,
        "board_quantity_by_revision": {
            revision_id: entry["board_quantity_by_revision"].get(revision_id, 0)
            for revision_id in assignment_bom_revision_ids
        },
        "total_board_quantity_by_revision": {
            revision_id: entry["total_quantity_by_revision"].get(revision_id, 0)
            for revision_id in assignment_bom_revision_ids
        },
        "first_bom_index": entry["first_bom_index"],
        "last_bom_index": entry["last_bom_index"],
        "is_stable_between_boms": is_stable_between_boms,
        "bom_labels": [
            entry["bom_labels_by_revision"][bom["bom_revision_id"]]
            for bom in ordered_boms
            if bom["bom_revision_id"] in entry["bom_revision_ids"]
        ],
        "is_fixed_feeder": bool(component.is_fixed_feeder),
        "fixed_cart_id": component.fixed_cart_id,
        "fixed_cart_name": cart.name if cart else None,
        "fixed_cart_kind": cart_kind_value(cart),
        "fixed_cart_target_category": cart.target_category if cart else None,
    }


def build_unassigned_payload(
    entry: Dict,
    reason: str,
    placement_group: str,
) -> Dict:
    component = entry["component"]
    bom_presence_count = len(entry["bom_revision_ids"])
    total_build_quantity = sum(entry["build_quantity_by_board_key"].values())
    average_board_quantity = round(entry["total_quantity"] / total_build_quantity, 2) if total_build_quantity else 0.0
    cart = component.fixed_cart
    return {
        "component_id": component.id,
        "component_label": component_display_label(component),
        "component_reference": component.reference,
        "footprint_pnp": component.footprint_pnp or component.package,
        "feeder_type": normalize_component_feeder_type(component.feeder_type),
        "feeder_size_mm": entry["feeder_size_mm"],
        "nozzle_type": deduce_nozzle_type(component.footprint_pnp or component.package, entry["feeder_size_mm"]),
        "slot_usage": entry["slot_usage"],
        "bom_presence_count": bom_presence_count,
        "total_build_quantity": total_build_quantity,
        "total_board_quantity": entry["total_quantity"],
        "average_board_quantity": average_board_quantity,
        "board_quantity_by_revision": dict(entry["board_quantity_by_revision"]),
        "total_board_quantity_by_revision": dict(entry["total_quantity_by_revision"]),
        "placement_group": placement_group,
        "fixed_cart_name": cart.name if cart else None,
        "fixed_cart_kind": cart_kind_value(cart),
        "reason": reason,
    }


def build_slot_payload(position: int, assignment: Optional[Dict]) -> Dict:
    if not assignment:
        return {
            "position": position,
            "status": "FREE",
            "assignment_index": None,
        }

    return {
        "position": position,
        "status": "ASSIGNED" if position == assignment["slot_start"] else "CONTINUATION",
        "assignment_index": assignment["assignment_index"],
        "component_label": assignment["component_label"],
        "component_reference": assignment["component_reference"],
        "feeder_size_mm": assignment["feeder_size_mm"],
        "placement_group": assignment["placement_group"],
        "slot_start": assignment["slot_start"],
        "slot_end": assignment["slot_end"],
        "slot_usage": assignment["slot_usage"],
    }


def build_bom_assignment_summaries(ordered_boms: List[Dict], slot_assignments: List[Dict]) -> List[Dict]:
    summaries = []
    for bom in ordered_boms:
        assignment_indexes = [
            assignment["assignment_index"]
            for assignment in slot_assignments
            if bom["bom_revision_id"] in assignment["bom_revision_ids"]
        ]
        summaries.append(
            {
                "bom_revision_id": bom["bom_revision_id"],
                "assignment_indexes": assignment_indexes,
                "assignment_count": len(assignment_indexes),
            }
        )
    return summaries
