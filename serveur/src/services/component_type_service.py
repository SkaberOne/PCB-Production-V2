"""Business component-type inference and reconciliation helpers."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Dict, List, Optional, Sequence, Tuple

from sqlalchemy.orm import Session

from ..models.bom import BomItem, Component, ComponentTypeRule
from ..utils.catalog_cache import (
    ComponentTypeRuleSnapshot,
    component_type_rules_cache,
    invalidate_component_type_rules,
)


FINAL_COMPONENT_TYPES = (
    "RESISTOR",
    "CAPACITOR",
    "INDUCTOR",
    "DIODE",
    "LED",
    "TRANSISTOR",
    "IC",
    "CONNECTOR",
    "FUSE",
    "RELAY",
    "MODULE",
    "POWER",
    "BUTTON/SWITCH",
    "CRYSTAL",
    "UNDEFINED",
)

AUTO_REPLACEABLE_COMPONENT_TYPES = {
    "R",
    "C",
    "L",
    "D",
    "Q",
    "T",
    "U",
    "J",
    "CN",
    "CON",
    "F",
    "K",
    "Z",
    "CR",
    "VR",
    "PB",
    "SW",
    "MOD",
    "RF",
    "BLE",
    "WIFI",
    "ESP-MODULE",
    "PASSIF",
    "PASSIVE",
    "UNDEFINED",
}

DEFAULT_COMPONENT_TYPE_RULES = (
    {
        "reference_prefix": "ESP-MODULE",
        "mapped_type": "MODULE",
        "priority": 10,
        "description": "Wireless modules",
    },
    {
        "reference_prefix": "LED",
        "mapped_type": "LED",
        "priority": 20,
        "requires_confirmation": True,
        "description": "Ambiguous with L* references, keep as suggestion",
    },
    {
        "reference_prefix": "U$",
        "mapped_type": "UNDEFINED",
        "priority": 20,
        "description": "CAD-generated unnamed IC references",
    },
    {
        "reference_prefix": "N$",
        "mapped_type": "UNDEFINED",
        "priority": 20,
        "description": "CAD-generated unnamed net references",
    },
    {
        "reference_prefix": "BEAD",
        "mapped_type": "UNDEFINED",
        "priority": 30,
        "description": "Ferrite beads stay manual",
    },
    {
        "reference_prefix": "FB",
        "mapped_type": "UNDEFINED",
        "priority": 30,
        "description": "Ferrite beads stay manual",
    },
    {
        "reference_prefix": "MOD",
        "mapped_type": "MODULE",
        "priority": 40,
        "description": "Generic module references",
    },
    {
        "reference_prefix": "WIFI",
        "mapped_type": "MODULE",
        "priority": 40,
        "description": "Wireless modules",
    },
    {
        "reference_prefix": "BLE",
        "mapped_type": "MODULE",
        "priority": 40,
        "description": "Bluetooth modules",
    },
    {
        "reference_prefix": "RF",
        "mapped_type": "MODULE",
        "priority": 40,
        "description": "RF modules",
    },
    {
        "reference_prefix": "CON",
        "mapped_type": "CONNECTOR",
        "priority": 50,
        "description": "Connector references",
    },
    {
        "reference_prefix": "CN",
        "mapped_type": "CONNECTOR",
        "priority": 50,
        "description": "Connector references",
    },
    {
        "reference_prefix": "PB",
        "mapped_type": "BUTTON/SWITCH",
        "priority": 50,
        "description": "Push-button references",
    },
    {
        "reference_prefix": "SW",
        "mapped_type": "BUTTON/SWITCH",
        "priority": 50,
        "description": "Switch references",
    },
    {
        "reference_prefix": "VR",
        "mapped_type": "UNDEFINED",
        "priority": 50,
        "description": "Regulators stay manual",
    },
    {
        "reference_prefix": "CR",
        "mapped_type": "DIODE",
        "priority": 50,
        "description": "Common rectifier diode references",
    },
    {
        "reference_prefix": "BR",
        "mapped_type": "DIODE",
        "priority": 50,
        "description": "Bridge rectifier / diode references",
    },
    {
        "reference_prefix": "IC",
        "mapped_type": "IC",
        "priority": 60,
        "description": "Integrated circuit references",
    },
    {
        "reference_prefix": "R",
        "mapped_type": "RESISTOR",
        "priority": 100,
        "description": "Resistor references",
    },
    {
        "reference_prefix": "C",
        "mapped_type": "CAPACITOR",
        "priority": 100,
        "description": "Capacitor references",
    },
    {
        "reference_prefix": "L",
        "mapped_type": "INDUCTOR",
        "priority": 100,
        "description": "Inductor references",
    },
    {
        "reference_prefix": "D",
        "mapped_type": "DIODE",
        "priority": 100,
        "description": "Diode references",
    },
    {
        "reference_prefix": "Q",
        "mapped_type": "TRANSISTOR",
        "priority": 100,
        "description": "Transistor references",
    },
    {
        "reference_prefix": "T",
        "mapped_type": "TRANSISTOR",
        "priority": 100,
        "description": "Transistor references",
    },
    {
        "reference_prefix": "U",
        "mapped_type": "IC",
        "priority": 100,
        "description": "Integrated circuit references",
    },
    {
        "reference_prefix": "J",
        "mapped_type": "CONNECTOR",
        "priority": 100,
        "description": "Connector references",
    },
    {
        "reference_prefix": "P",
        "mapped_type": "UNDEFINED",
        "priority": 100,
        "description": "Could be a connector or test point",
    },
    {
        "reference_prefix": "F",
        "mapped_type": "FUSE",
        "priority": 100,
        "description": "Fuse references",
    },
    {
        "reference_prefix": "K",
        "mapped_type": "RELAY",
        "priority": 100,
        "description": "Relay references",
    },
    {
        "reference_prefix": "X",
        "mapped_type": "UNDEFINED",
        "priority": 100,
        "description": "Crystal / oscillator references stay manual",
    },
    {
        "reference_prefix": "Y",
        "mapped_type": "UNDEFINED",
        "priority": 100,
        "description": "Crystal / oscillator references stay manual",
    },
    {
        "reference_prefix": "Z",
        "mapped_type": "DIODE",
        "priority": 100,
        "description": "Zeners are stored under DIODE",
    },
    {
        "reference_prefix": "N",
        "mapped_type": "UNDEFINED",
        "priority": 120,
        "description": "Unknown net-like references stay manual",
    },
)

CREATED_FROM_BOM_NOTE_PATTERN = re.compile(r"Created from BOM .* item (?P<reference>[^\s]+)$", re.IGNORECASE)


@dataclass
class ResolvedComponentType:
    component_type: str
    requires_confirmation: bool
    candidate_types: List[str]
    matched_prefixes: List[str]


@dataclass
class ComponentTypeRefreshResult:
    updated_component_count: int
    updated_bom_item_count: int
    inferred_type_count: int
    ambiguous_component_count: int
    manual_preserved_count: int
    skipped_count: int
    ambiguous_component_ids: List[int]


class ComponentTypeService:
    """Infer business component families from BOM references."""

    @staticmethod
    def clean_text(value) -> Optional[str]:
        if value is None:
            return None

        cleaned = str(value).strip()
        return cleaned or None

    @classmethod
    def normalize_component_type(cls, value) -> Optional[str]:
        cleaned = cls.clean_text(value)
        return cleaned.upper() if cleaned else None

    @classmethod
    def normalize_reference(cls, value) -> str:
        return cls.normalize_component_type(value) or ""

    @classmethod
    def is_final_component_type(cls, value) -> bool:
        return cls.normalize_component_type(value) in FINAL_COMPONENT_TYPES

    @classmethod
    def is_auto_replaceable_component_type(cls, value) -> bool:
        normalized = cls.normalize_component_type(value)
        return normalized is None or normalized in AUTO_REPLACEABLE_COMPONENT_TYPES

    @classmethod
    def normalize_for_storage(cls, value) -> Optional[str]:
        normalized = cls.normalize_component_type(value)
        return normalized if normalized else None

    @classmethod
    def ensure_default_rules(cls, db: Session) -> List[ComponentTypeRule]:
        existing_count = db.query(ComponentTypeRule).count()
        if existing_count > 0:
            return db.query(ComponentTypeRule).filter(ComponentTypeRule.enabled.is_(True)).all()

        for rule_definition in DEFAULT_COMPONENT_TYPE_RULES:
            normalized_prefix = cls.normalize_reference(rule_definition["reference_prefix"])
            db.add(
                ComponentTypeRule(
                    reference_prefix=normalized_prefix,
                    mapped_type=cls.normalize_component_type(rule_definition.get("mapped_type")),
                    requires_confirmation=bool(rule_definition.get("requires_confirmation")),
                    priority=int(rule_definition.get("priority", 100)),
                    enabled=True,
                    description=rule_definition.get("description"),
                )
            )

        db.commit()
        # Newly created rules → stale cache
        invalidate_component_type_rules()
        return db.query(ComponentTypeRule).filter(ComponentTypeRule.enabled.is_(True)).all()

    @classmethod
    def reset_rules(cls, db: Session) -> List[ComponentTypeRule]:
        db.query(ComponentTypeRule).delete(synchronize_session=False)

        for rule_definition in DEFAULT_COMPONENT_TYPE_RULES:
            db.add(
                ComponentTypeRule(
                    reference_prefix=cls.normalize_reference(rule_definition["reference_prefix"]),
                    mapped_type=cls.normalize_component_type(rule_definition.get("mapped_type")),
                    requires_confirmation=bool(rule_definition.get("requires_confirmation")),
                    priority=int(rule_definition.get("priority", 100)),
                    enabled=True,
                    description=rule_definition.get("description"),
                )
            )

        db.commit()
        invalidate_component_type_rules()
        return db.query(ComponentTypeRule).filter(ComponentTypeRule.enabled.is_(True)).all()

    @classmethod
    def list_rules(cls, db: Session) -> List[ComponentTypeRuleSnapshot]:
        """Return the active, priority-sorted rule list.

        Results are served from a process-level TTL cache when warm.
        The cache is invalidated automatically after any write to the
        ComponentTypeRule table (via invalidate_component_type_rules()).
        """
        cached = component_type_rules_cache.get()
        if cached is not None:
            return cached

        cls.ensure_default_rules(db)
        rules = db.query(ComponentTypeRule).filter(ComponentTypeRule.enabled.is_(True)).all()
        sorted_rules = sorted(
            rules,
            key=lambda rule: (
                int(rule.priority or 100),
                -len(cls.normalize_reference(rule.reference_prefix)),
                cls.normalize_reference(rule.reference_prefix),
                int(rule.id or 0),
            ),
        )
        snapshots = [
            ComponentTypeRuleSnapshot(
                id=rule.id,
                reference_prefix=rule.reference_prefix,
                mapped_type=rule.mapped_type,
                requires_confirmation=bool(rule.requires_confirmation),
                priority=int(rule.priority or 100),
                enabled=bool(rule.enabled),
                description=rule.description,
            )
            for rule in sorted_rules
        ]
        component_type_rules_cache.set(snapshots)
        return snapshots

    @classmethod
    def resolve_reference(
        cls,
        db: Session,
        reference: Optional[str],
        *,
        current_type: Optional[str] = None,
    ) -> ResolvedComponentType:
        normalized_reference = cls.normalize_reference(reference)
        if not normalized_reference:
            return ResolvedComponentType(
                component_type="UNDEFINED",
                requires_confirmation=False,
                candidate_types=["UNDEFINED"],
                matched_prefixes=[],
            )

        rules = cls.list_rules(db)
        matched_rules = [
            rule
            for rule in rules
            if normalized_reference.startswith(cls.normalize_reference(rule.reference_prefix))
        ]
        if not matched_rules:
            return ResolvedComponentType(
                component_type="UNDEFINED",
                requires_confirmation=False,
                candidate_types=["UNDEFINED"],
                matched_prefixes=[],
            )

        chosen_rule = matched_rules[0]
        chosen_type = cls.normalize_component_type(chosen_rule.mapped_type) or "UNDEFINED"
        candidate_types: List[str] = []
        for rule in matched_rules:
            candidate_type = cls.normalize_component_type(rule.mapped_type) or "UNDEFINED"
            if candidate_type not in candidate_types:
                candidate_types.append(candidate_type)

        top_priority = int(chosen_rule.priority or 100)
        conflicting_top_priority_types = {
            cls.normalize_component_type(rule.mapped_type) or "UNDEFINED"
            for rule in matched_rules
            if int(rule.priority or 100) == top_priority
        }
        requires_confirmation = (
            chosen_type != "UNDEFINED"
            and (
                bool(chosen_rule.requires_confirmation)
                or len(conflicting_top_priority_types) > 1
            )
        )

        normalized_current_type = cls.normalize_component_type(current_type)
        if normalized_current_type and cls.is_final_component_type(normalized_current_type):
            if normalized_current_type != chosen_type:
                return ResolvedComponentType(
                    component_type=normalized_current_type,
                    requires_confirmation=False,
                    candidate_types=candidate_types or [normalized_current_type],
                    matched_prefixes=[cls.normalize_reference(rule.reference_prefix) for rule in matched_rules],
                )

            if not requires_confirmation:
                return ResolvedComponentType(
                    component_type=normalized_current_type,
                    requires_confirmation=False,
                    candidate_types=candidate_types or [normalized_current_type],
                    matched_prefixes=[cls.normalize_reference(rule.reference_prefix) for rule in matched_rules],
                )

        return ResolvedComponentType(
            component_type=chosen_type,
            requires_confirmation=requires_confirmation,
            candidate_types=candidate_types or [chosen_type],
            matched_prefixes=[cls.normalize_reference(rule.reference_prefix) for rule in matched_rules],
        )

    @classmethod
    def extract_reference_from_component_notes(cls, notes: Optional[str]) -> Optional[str]:
        cleaned_notes = cls.clean_text(notes)
        if not cleaned_notes:
            return None

        match = CREATED_FROM_BOM_NOTE_PATTERN.search(cleaned_notes)
        if not match:
            return None

        return cls.clean_text(match.group("reference"))

    @classmethod
    def can_recalculate_component(cls, component: Component) -> bool:
        notes = cls.clean_text(component.notes) or ""
        if not notes.upper().startswith("CREATED FROM BOM"):
            return False

        return cls.is_auto_replaceable_component_type(component.component_type)

    @classmethod
    def can_recalculate_bom_item(cls, item: BomItem) -> bool:
        return cls.is_auto_replaceable_component_type(item.component_type)

    @classmethod
    def validate_confirmation_for_activation(
        cls,
        db: Session,
        *,
        reference: Optional[str],
        current_type: Optional[str],
        requested_type: Optional[str],
        confirmed: bool,
    ) -> Tuple[bool, Optional[str]]:
        current_resolution = cls.resolve_reference(db, reference, current_type=current_type)
        if not current_resolution.requires_confirmation:
            return True, None

        normalized_requested_type = (
            cls.normalize_component_type(requested_type)
            or current_resolution.component_type
        )
        if confirmed or normalized_requested_type != current_resolution.component_type:
            return True, None

        return (
            False,
            (
                f"Reference '{reference}' requires a manual type confirmation "
                f"before final validation"
            ),
        )

    @classmethod
    def reconcile_database(
        cls,
        db: Session,
        *,
        apply_defaults=None,
    ) -> ComponentTypeRefreshResult:
        updated_component_count = 0
        updated_bom_item_count = 0
        inferred_type_count = 0
        ambiguous_component_ids: List[int] = []
        manual_preserved_count = 0
        skipped_count = 0

        for item in db.query(BomItem).all():
            if not cls.can_recalculate_bom_item(item):
                continue

            resolved_type = cls.resolve_reference(
                db,
                item.reference_item,
                current_type=None,
            )
            if cls.normalize_component_type(item.component_type) == resolved_type.component_type:
                continue

            item.component_type = resolved_type.component_type
            updated_bom_item_count += 1

        components = db.query(Component).all()
        for component in components:
            if not cls.can_recalculate_component(component):
                if cls.clean_text(component.notes or "").upper().startswith("CREATED FROM BOM"):
                    manual_preserved_count += 1
                continue

            bom_reference = cls.extract_reference_from_component_notes(component.notes)
            if not bom_reference:
                skipped_count += 1
                continue

            resolved_type = cls.resolve_reference(
                db,
                bom_reference,
                current_type=None,
            )
            current_component_type = cls.normalize_component_type(component.component_type)
            component_changed = False

            if current_component_type != resolved_type.component_type:
                component.component_type = resolved_type.component_type
                updated_component_count += 1
                inferred_type_count += 1
                component_changed = True

            if apply_defaults and apply_defaults(db, component, overwrite=False):
                if not component_changed:
                    updated_component_count += 1
                    component_changed = True

            if component_changed and resolved_type.requires_confirmation and component.id is not None:
                ambiguous_component_ids.append(component.id)

        db.commit()

        return ComponentTypeRefreshResult(
            updated_component_count=updated_component_count,
            updated_bom_item_count=updated_bom_item_count,
            inferred_type_count=inferred_type_count,
            ambiguous_component_count=len(ambiguous_component_ids),
            manual_preserved_count=manual_preserved_count,
            skipped_count=skipped_count,
            ambiguous_component_ids=ambiguous_component_ids,
        )
