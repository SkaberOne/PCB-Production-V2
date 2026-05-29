"""Fixed-feeder calculations and related queries."""

import logging
from typing import Dict, List, Optional, Tuple

from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from ..models.bom import BomItem, BomReference, BomRevision, Component
from ..models.machines import PnpCart, PnpFeeder
from ..utils.feeder_types import feeder_type_from_size_mm
from .assignment_helpers import (
    component_slot_usage,
    fixed_feeder_sort_key,
    normalize_category_key,
    serialize_cart,
    serialize_fixed_feeder_component,
)
from .component_library_service import ComponentLibraryService

logger = logging.getLogger(__name__)


class AssignmentFixedFeederMixin:
    """Fixed-feeder orchestration built from BOM usage."""

    @classmethod
    def _load_component_usage_index(
        cls,
        db: Session,
        components: List[Component],
    ) -> Tuple[Dict[int, Dict], int]:
        bom_rows = (
            db.query(BomItem, BomRevision.bom_ref_id, BomReference.category)
            .join(BomRevision, BomRevision.id == BomItem.bom_revision_id)
            .join(BomReference, BomReference.id == BomRevision.bom_ref_id)
            .filter(BomRevision.status == BomRevision.StatusEnum.ACTIVE)
            .all()
        )
        if not bom_rows or not components:
            return {}, 0

        component_lookup = ComponentLibraryService.build_lookup(components)
        usage_index: Dict[int, Dict] = {}
        unmatched_bom_items = 0

        for bom_item, bom_ref_id, category in bom_rows:
            matched_component = ComponentLibraryService.match_bom_item(component_lookup, bom_item)
            if not matched_component:
                unmatched_bom_items += 1
                continue

            usage_entry = usage_index.setdefault(
                matched_component.id,
                {
                    "component": matched_component,
                    "reference_ids": set(),
                    "category_keys": set(),
                    "quantity_by_reference": {},
                    "usage_quantity": 0,
                },
            )
            usage_entry["reference_ids"].add(bom_ref_id)
            usage_entry["quantity_by_reference"][bom_ref_id] = (
                usage_entry["quantity_by_reference"].get(bom_ref_id, 0) + max(int(bom_item.quantity or 1), 1)
            )
            normalized_category = normalize_category_key(category)
            if normalized_category:
                usage_entry["category_keys"].add(normalized_category)
            usage_entry["usage_quantity"] += max(int(bom_item.quantity or 1), 1)

        return usage_index, unmatched_bom_items

    @staticmethod
    def _select_cart_with_capacity(
        carts: List[PnpCart],
        remaining_positions: Dict[int, int],
        required_positions: int,
    ) -> Tuple[Optional[PnpCart], str]:
        if not carts:
            return None, "no_cart"

        for cart in carts:
            if remaining_positions.get(cart.id, cart.capacity_positions or 0) >= required_positions:
                remaining_positions[cart.id] = remaining_positions.get(cart.id, cart.capacity_positions or 0) - required_positions
                return cart, "assigned"

        return None, "capacity"

    @classmethod
    def calculate_fixed_feeders(cls, db: Session) -> Dict:
        auto_carts = (
            db.query(PnpCart)
            .options(joinedload(PnpCart.components))
            .filter(PnpCart.kind.in_([PnpCart.KindEnum.COMMON, PnpCart.KindEnum.CATEGORY]))
            .order_by(PnpCart.name.asc(), PnpCart.id.asc())
            .all()
        )
        if not auto_carts:
            raise ValueError("Aucun chariot COMMON ou CATEGORY disponible pour le calcul.")

        components = (
            db.query(Component)
            .options(joinedload(Component.fixed_cart))
            .order_by(Component.id.asc())
            .all()
        )
        if not components:
            raise ValueError("La bibliotheque composants est vide.")

        component_usage, unmatched_bom_items = cls._load_component_usage_index(db=db, components=components)
        if not component_usage:
            raise ValueError("Aucune donnee BOM ACTIVE disponible pour calculer les feeders fixes.")

        common_carts = [cart for cart in auto_carts if cart.kind == PnpCart.KindEnum.COMMON]
        category_carts_by_key: Dict[str, List[PnpCart]] = {}
        for cart in auto_carts:
            if cart.kind != PnpCart.KindEnum.CATEGORY:
                continue
            category_key = normalize_category_key(cart.target_category)
            if not category_key:
                continue
            category_carts_by_key.setdefault(category_key, []).append(cart)

        remaining_positions = {cart.id: max(int(cart.capacity_positions or 0), 0) for cart in auto_carts}
        previous_auto_assignment_map = {
            component.id: component.fixed_cart_id
            for component in components
            if component.fixed_cart and component.fixed_cart.kind != PnpCart.KindEnum.CUSTOM and component.is_fixed_feeder
        }
        preserved_custom_component_ids = {
            component.id
            for component in components
            if component.fixed_cart and component.fixed_cart.kind == PnpCart.KindEnum.CUSTOM and component.is_fixed_feeder
        }

        preserved_custom_count = len(preserved_custom_component_ids)
        skipped_no_category_count = 0
        skipped_multiple_categories_count = 0
        skipped_no_cart_count = 0
        skipped_capacity_count = 0
        assigned_common_count = 0
        assigned_category_count = 0

        common_candidates: List[Dict] = []
        category_candidates: List[Dict] = []

        for usage_entry in component_usage.values():
            component = usage_entry["component"]
            if component.id in preserved_custom_component_ids:
                continue

            candidate = {
                "component": component,
                "reference_count": len(usage_entry["reference_ids"]),
                "category_keys": sorted(usage_entry["category_keys"]),
                "usage_quantity": usage_entry["usage_quantity"],
                "slot_usage": component_slot_usage(component),
            }

            if candidate["reference_count"] >= 2:
                common_candidates.append(candidate)
            elif len(candidate["category_keys"]) == 1:
                category_candidates.append(candidate)
            elif len(candidate["category_keys"]) > 1:
                skipped_multiple_categories_count += 1
            else:
                skipped_no_category_count += 1

        assignments: List[Dict] = []

        def try_assign_candidate(candidate: Dict, cart_groups: List[Tuple[List[PnpCart], str]]) -> Tuple[Optional[PnpCart], Optional[str], str]:
            saw_capacity_limit = False
            saw_compatible_cart = False

            for carts, strategy in cart_groups:
                if not carts:
                    continue

                saw_compatible_cart = True
                selected_cart, status = cls._select_cart_with_capacity(carts, remaining_positions, candidate["slot_usage"])
                if selected_cart:
                    return selected_cart, strategy, "assigned"
                if status == "capacity":
                    saw_capacity_limit = True

            if saw_capacity_limit:
                return None, None, "capacity"
            if saw_compatible_cart:
                return None, None, "capacity"
            return None, None, "no_cart"

        for candidate in sorted(common_candidates, key=fixed_feeder_sort_key):
            fallback_category_carts = []
            if len(candidate["category_keys"]) == 1:
                fallback_category_carts = category_carts_by_key.get(candidate["category_keys"][0], [])

            selected_cart, strategy, status = try_assign_candidate(
                candidate,
                [
                    (common_carts, "COMMON"),
                    (fallback_category_carts, "CATEGORY"),
                ],
            )
            if selected_cart:
                assignments.append({**candidate, "cart": selected_cart, "strategy": strategy})
                if strategy == "COMMON":
                    assigned_common_count += 1
                else:
                    assigned_category_count += 1
                continue

            if status == "capacity":
                skipped_capacity_count += 1
            else:
                skipped_no_cart_count += 1

        for candidate in sorted(category_candidates, key=fixed_feeder_sort_key):
            selected_cart, strategy, status = try_assign_candidate(
                candidate,
                [
                    (category_carts_by_key.get(candidate["category_keys"][0], []), "CATEGORY"),
                ],
            )
            if selected_cart:
                assignments.append({**candidate, "cart": selected_cart, "strategy": strategy})
                assigned_category_count += 1
                continue

            if status == "capacity":
                skipped_capacity_count += 1
            else:
                skipped_no_cart_count += 1

        for component in components:
            if component.fixed_cart and component.fixed_cart.kind != PnpCart.KindEnum.CUSTOM:
                component.fixed_cart = None
                component.fixed_cart_id = None
                component.is_fixed_feeder = False

        new_auto_assignment_map: Dict[int, int] = {}
        for assignment in assignments:
            component = assignment["component"]
            cart = assignment["cart"]
            component.fixed_cart = cart
            component.fixed_cart_id = cart.id
            component.is_fixed_feeder = True
            new_auto_assignment_map[component.id] = cart.id

        db.commit()

        refreshed_carts = (
            db.query(PnpCart)
            .options(joinedload(PnpCart.components))
            .filter(PnpCart.id.in_([cart.id for cart in auto_carts]))
            .order_by(PnpCart.name.asc(), PnpCart.id.asc())
            .all()
        )

        cleared_count = len(set(previous_auto_assignment_map) - set(new_auto_assignment_map))
        changed_count = sum(
            1
            for component_id, cart_id in new_auto_assignment_map.items()
            if previous_auto_assignment_map.get(component_id) != cart_id
        ) + cleared_count

        warnings = []
        if unmatched_bom_items:
            warnings.append(f"{unmatched_bom_items} ligne(s) BOM n'ont pas trouve de composant dans la bibliotheque.")
        if skipped_no_category_count:
            warnings.append(f"{skipped_no_category_count} composant(s) ignores faute de categorie BOM exploitable.")
        if skipped_no_cart_count:
            warnings.append(f"{skipped_no_cart_count} composant(s) n'ont pas de chariot automatique compatible.")
        if skipped_capacity_count:
            warnings.append(f"{skipped_capacity_count} composant(s) n'ont pas pu etre places faute de capacite.")

        logger.info(
            "Calculated fixed feeders: %s assigned, %s cleared, %s warnings",
            len(assignments),
            cleared_count,
            len(warnings),
        )

        return {
            "assigned_count": len(assignments),
            "assigned_common_count": assigned_common_count,
            "assigned_category_count": assigned_category_count,
            "processed_component_count": len(component_usage),
            "changed_count": changed_count,
            "cleared_count": cleared_count,
            "preserved_custom_count": preserved_custom_count,
            "unmatched_bom_items": unmatched_bom_items,
            "skipped_no_category_count": skipped_no_category_count,
            "skipped_multiple_categories_count": skipped_multiple_categories_count,
            "skipped_no_cart_count": skipped_no_cart_count,
            "skipped_capacity_count": skipped_capacity_count,
            "warnings": warnings,
            "carts": [serialize_cart(cart) for cart in refreshed_carts],
            "assignments_preview": [
                {
                    "component_id": assignment["component"].id,
                    "reference": assignment["component"].reference,
                    "value": assignment["component"].value,
                    "mpn": assignment["component"].mpn,
                    "cart_id": assignment["cart"].id,
                    "cart_name": assignment["cart"].name,
                    "strategy": assignment["strategy"],
                    "reference_count": assignment["reference_count"],
                    "slot_usage": assignment["slot_usage"],
                }
                for assignment in sorted(
                    assignments,
                    key=lambda item: (
                        item["cart"].name.upper(),
                        (item["component"].mpn or item["component"].value or item["component"].reference or "").upper(),
                    ),
                )[:25]
            ],
        }

    @classmethod
    def list_fixed_feeder_components(
        cls,
        db: Session,
        *,
        search: Optional[str] = None,
        only_fixed: bool = True,
        limit: int = 200,
        offset: int = 0,
    ) -> Tuple[List[Dict], int, int]:
        base_query = db.query(Component).options(joinedload(Component.fixed_cart))

        if only_fixed:
            base_query = base_query.filter(
                or_(
                    Component.is_fixed_feeder.is_(True),
                    Component.fixed_cart_id.isnot(None),
                )
            )

        if search and search.strip():
            token = f"%{search.strip()}%"
            base_query = base_query.filter(
                or_(
                    Component.reference.ilike(token),
                    Component.value.ilike(token),
                    Component.mpn.ilike(token),
                    Component.footprint_eagle.ilike(token),
                    Component.footprint_pnp.ilike(token),
                    Component.package.ilike(token),
                    Component.feeder_type.ilike(token),
                    Component.description.ilike(token),
                    Component.notes.ilike(token),
                )
            )

        all_components = (
            db.query(Component)
            .options(joinedload(Component.fixed_cart))
            .order_by(Component.id.asc())
            .all()
        )
        usage_index, unmatched_bom_items = cls._load_component_usage_index(db=db, components=all_components)

        filtered_components = base_query.order_by(Component.reference.asc()).all()
        rows = [
            serialize_fixed_feeder_component(component, usage_index.get(component.id))
            for component in filtered_components
        ]
        rows.sort(
            key=lambda row: (
                0 if row["is_fixed_feeder"] else 1,
                -int(row["bom_reference_count"] or 0),
                -float(row["average_board_quantity"] or 0),
                -int(row["feeder_size_mm"] or 0),
                (row["reference"] or "").upper(),
            )
        )

        total = len(rows)
        sliced_rows = rows[offset: offset + limit]
        return sliced_rows, total, unmatched_bom_items

    @classmethod
    def update_fixed_feeder_component(
        cls,
        db: Session,
        *,
        component_id: int,
        is_fixed_feeder: bool,
        fixed_cart_id: Optional[int],
        fixed_cart_id_provided: bool,
        feeder_id: Optional[int] = None,
    ) -> Component:
        component = (
            db.query(Component)
            .options(joinedload(Component.fixed_cart))
            .filter(Component.id == component_id)
            .first()
        )
        if not component:
            raise ValueError(f"Component {component_id} not found")

        if feeder_id is not None:
            feeder = db.query(PnpFeeder).filter(PnpFeeder.id == feeder_id).first()
            if not feeder:
                raise ValueError(f"Feeder {feeder_id} not found")
            component.feeder_type = feeder_type_from_size_mm(feeder.size_mm)

        target_cart_id = component.fixed_cart_id
        if fixed_cart_id_provided:
            target_cart_id = fixed_cart_id

        if not is_fixed_feeder:
            component.is_fixed_feeder = False
            component.fixed_cart = None
            component.fixed_cart_id = None
            db.commit()
            db.refresh(component)
            return component

        if target_cart_id is None:
            raise ValueError("Un chariot fixe est obligatoire pour enregistrer un feeder fixe.")

        cart = db.query(PnpCart).filter(PnpCart.id == target_cart_id).first()
        if not cart:
            raise ValueError(f"Cart {target_cart_id} not found")

        component.is_fixed_feeder = True
        component.fixed_cart = cart
        component.fixed_cart_id = cart.id

        db.commit()
        db.refresh(component)
        return component
