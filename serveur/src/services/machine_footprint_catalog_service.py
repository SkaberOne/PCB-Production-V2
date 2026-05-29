"""Helpers for importing and applying the machine-footprint catalog."""

from __future__ import annotations

import csv
import io
import re
from dataclasses import dataclass
from typing import Dict, Iterable, List, Optional

from sqlalchemy import asc, func
from sqlalchemy.orm import Session

from ..models.bom import Component, MachineFootprintRule
from ..utils.feeder_types import feeder_type_from_size_mm, normalize_component_feeder_type


HEADER_FIELD_MAP = {
    "type": "component_type",
    "footprint": "machine_footprint",
    "machinefootprint": "machine_footprint",
    "tapewidthmm": "tape_width_mm",
    "pitchmm": "pitch_mm",
    "feeder": "feeder_type",
}

PASSIVE_LEGACY_COMPONENT_TYPES = {"PASSIF", "PASSIVE"}
PASSIVE_COMPONENT_TYPES = ("RESISTOR", "CAPACITOR", "INDUCTOR")


@dataclass
class MachineFootprintCatalogImportResult:
    created_count: int
    updated_count: int
    skipped_count: int
    item_count: int
    synchronized_component_count: int
    errors: List[str]


@dataclass
class MachineFootprintCatalogEntry:
    component_type: Optional[str]
    machine_footprint: str
    tape_width_mm: Optional[float]
    pitch_mm: Optional[float]
    feeder_type: Optional[str]
    variant_count: int


class MachineFootprintCatalogService:
    """Manage the machine-footprint rule catalog."""

    @staticmethod
    def clean_text(value) -> Optional[str]:
        if value is None:
            return None
        text = str(value).strip()
        return text or None

    @classmethod
    def normalize_machine_footprint(cls, value) -> Optional[str]:
        text = cls.clean_text(value)
        return text.upper() if text else None

    @classmethod
    def normalize_component_type(cls, value) -> Optional[str]:
        text = cls.clean_text(value)
        return text.upper() if text else None

    @classmethod
    def normalize_component_type_token(cls, value) -> Optional[str]:
        return cls.normalize_component_type(value)

    @classmethod
    def expand_component_types(cls, value) -> List[Optional[str]]:
        normalized_type = cls.normalize_component_type(value)
        if normalized_type in PASSIVE_LEGACY_COMPONENT_TYPES:
            return list(PASSIVE_COMPONENT_TYPES)

        return [normalized_type]

    @classmethod
    def normalize_float(cls, value, field_name: str) -> Optional[float]:
        if value is None:
            return None

        if isinstance(value, (int, float)):
            return float(value)

        text = cls.clean_text(value)
        if not text:
            return None

        normalized = text.replace(",", ".")
        try:
            return float(normalized)
        except ValueError as exc:
            raise ValueError(f"Invalid {field_name} value: {value}") from exc

    @staticmethod
    def normalize_header_token(value) -> str:
        return re.sub(r"[^a-z0-9]+", "", str(value or "").strip().lower())

    @classmethod
    def decode_bytes(cls, payload: bytes) -> str:
        for encoding in ("utf-8-sig", "utf-8", "cp1252", "latin-1"):
            try:
                return payload.decode(encoding)
            except UnicodeDecodeError:
                continue
        raise ValueError("Unable to decode the machine-footprint file")

    @classmethod
    def resolve_headers(cls, headers: Iterable[object]) -> Dict[str, int]:
        resolved_indexes: Dict[str, int] = {}
        for index, header in enumerate(headers):
            field_name = HEADER_FIELD_MAP.get(cls.normalize_header_token(header))
            if field_name:
                resolved_indexes[field_name] = index

        if "machine_footprint" not in resolved_indexes:
            raise ValueError(
                "Invalid machine-footprint header. Expected columns such as: "
                "Type;Footprint;Tape_width_mm;Pitch_mm;Feeder"
            )

        return resolved_indexes

    @classmethod
    def _match_rule_identity(
        cls,
        rule: MachineFootprintRule,
        *,
        component_type: Optional[str],
        machine_footprint: str,
        tape_width_mm: Optional[float],
        pitch_mm: Optional[float],
    ) -> bool:
        return (
            cls.normalize_component_type_token(rule.component_type)
            == cls.normalize_component_type_token(component_type)
            and rule.machine_footprint == machine_footprint
            and rule.tape_width_mm == tape_width_mm
            and rule.pitch_mm == pitch_mm
        )

    @classmethod
    def list_rules(
        cls,
        db: Session,
        *,
        search: Optional[str] = None,
        limit: int = 1000,
    ) -> List[MachineFootprintRule]:
        cls.ensure_passive_rule_expansion(db)
        query = db.query(MachineFootprintRule)

        if search and search.strip():
            token = f"%{search.strip()}%"
            query = query.filter(
                (
                    MachineFootprintRule.machine_footprint.ilike(token)
                    | MachineFootprintRule.component_type.ilike(token)
                    | MachineFootprintRule.feeder_type.ilike(token)
                )
            )

        return (
            query.order_by(
                asc(func.lower(func.coalesce(MachineFootprintRule.machine_footprint, ""))),
                asc(func.lower(func.coalesce(MachineFootprintRule.component_type, ""))),
                asc(MachineFootprintRule.tape_width_mm),
                asc(MachineFootprintRule.pitch_mm),
                asc(MachineFootprintRule.id),
            )
            .limit(limit)
            .all()
        )

    @classmethod
    def get_catalog_candidates(
        cls,
        db: Session,
        machine_footprint: Optional[str],
        *,
        component_type: Optional[str] = None,
    ) -> List[MachineFootprintRule]:
        cls.ensure_passive_rule_expansion(db)
        normalized_footprint = cls.normalize_machine_footprint(machine_footprint)
        if not normalized_footprint:
            return []

        candidates = (
            db.query(MachineFootprintRule)
            .filter(MachineFootprintRule.machine_footprint == normalized_footprint)
            .order_by(
                asc(func.lower(func.coalesce(MachineFootprintRule.component_type, ""))),
                asc(MachineFootprintRule.tape_width_mm),
                asc(MachineFootprintRule.pitch_mm),
                asc(MachineFootprintRule.id),
            )
            .all()
        )
        if not candidates:
            return []

        preferred_component_type = cls.normalize_component_type_token(component_type)
        if not preferred_component_type:
            return candidates

        narrowed_candidates = [
            rule
            for rule in candidates
            if cls.normalize_component_type_token(rule.component_type) == preferred_component_type
        ]
        return narrowed_candidates or candidates

    @classmethod
    def _resolve_shared_text(cls, rules: List[MachineFootprintRule], field_name: str) -> Optional[str]:
        values = []
        for rule in rules:
            value = cls.clean_text(getattr(rule, field_name, None))
            if value and value not in values:
                values.append(value)

        return values[0] if len(values) == 1 else None

    @classmethod
    def _resolve_shared_number(cls, rules: List[MachineFootprintRule], field_name: str) -> Optional[float]:
        values = []
        for rule in rules:
            value = getattr(rule, field_name, None)
            if value is not None and value not in values:
                values.append(value)

        return values[0] if len(values) == 1 else None

    @classmethod
    def build_catalog_entry(
        cls,
        rules: List[MachineFootprintRule],
        *,
        machine_footprint: Optional[str] = None,
    ) -> Optional[MachineFootprintCatalogEntry]:
        if not rules:
            normalized_footprint = cls.normalize_machine_footprint(machine_footprint)
            return (
                MachineFootprintCatalogEntry(
                    component_type=None,
                    machine_footprint=normalized_footprint,
                    tape_width_mm=None,
                    pitch_mm=None,
                    feeder_type=None,
                    variant_count=0,
                )
                if normalized_footprint
                else None
            )

        normalized_footprint = cls.normalize_machine_footprint(
            machine_footprint or rules[0].machine_footprint
        )
        return MachineFootprintCatalogEntry(
            component_type=cls._resolve_shared_text(rules, "component_type"),
            machine_footprint=normalized_footprint or rules[0].machine_footprint,
            tape_width_mm=cls._resolve_shared_number(rules, "tape_width_mm"),
            pitch_mm=cls._resolve_shared_number(rules, "pitch_mm"),
            feeder_type=cls._resolve_shared_text(rules, "feeder_type"),
            variant_count=len(rules),
        )

    @classmethod
    def get_catalog_entry(
        cls,
        db: Session,
        machine_footprint: Optional[str],
        *,
        component_type: Optional[str] = None,
    ) -> Optional[MachineFootprintCatalogEntry]:
        rules = cls.get_catalog_candidates(
            db,
            machine_footprint,
            component_type=component_type,
        )
        return cls.build_catalog_entry(rules, machine_footprint=machine_footprint)

    @classmethod
    def ensure_passive_rule_expansion(cls, db: Session) -> int:
        passive_rules = (
            db.query(MachineFootprintRule)
            .filter(
                func.upper(func.coalesce(MachineFootprintRule.component_type, "")).in_(
                    list(PASSIVE_LEGACY_COMPONENT_TYPES)
                )
            )
            .all()
        )
        if not passive_rules:
            return 0

        created_rules = 0
        for rule in passive_rules:
            existing_rules = (
                db.query(MachineFootprintRule)
                .filter(MachineFootprintRule.machine_footprint == rule.machine_footprint)
                .all()
            )
            for component_type in PASSIVE_COMPONENT_TYPES:
                already_exists = any(
                    cls._match_rule_identity(
                        candidate,
                        component_type=component_type,
                        machine_footprint=rule.machine_footprint,
                        tape_width_mm=rule.tape_width_mm,
                        pitch_mm=rule.pitch_mm,
                    )
                    for candidate in existing_rules
                )
                if already_exists:
                    continue

                cloned_rule = MachineFootprintRule(
                    component_type=component_type,
                    machine_footprint=rule.machine_footprint,
                    tape_width_mm=rule.tape_width_mm,
                    pitch_mm=rule.pitch_mm,
                    feeder_type=rule.feeder_type,
                )
                db.add(cloned_rule)
                existing_rules.append(cloned_rule)
                created_rules += 1

            db.delete(rule)

        if created_rules or passive_rules:
            db.flush()

        return created_rules

    @classmethod
    def _assign_text_field(
        cls,
        target,
        field_name: str,
        value: Optional[str],
        *,
        overwrite: bool,
    ) -> bool:
        cleaned_value = cls.clean_text(value)
        current_value = cls.clean_text(getattr(target, field_name, None))
        if cleaned_value is None:
            return False
        if not overwrite and current_value is not None:
            return False
        if current_value == cleaned_value:
            return False

        setattr(target, field_name, cleaned_value)
        return True

    @classmethod
    def _assign_numeric_field(
        cls,
        target,
        field_name: str,
        value: Optional[float],
        *,
        overwrite: bool,
    ) -> bool:
        current_value = getattr(target, field_name, None)
        if value is None:
            return False
        if not overwrite and current_value is not None:
            return False
        if current_value == value:
            return False

        setattr(target, field_name, value)
        return True

    @classmethod
    def apply_catalog_entry_to_component(
        cls,
        component: Component,
        catalog_entry: Optional[MachineFootprintCatalogEntry],
        *,
        overwrite: bool = False,
    ) -> bool:
        if not catalog_entry:
            return False

        changed = False
        changed |= cls._assign_text_field(
            component,
            "component_type",
            catalog_entry.component_type,
            overwrite=overwrite,
        )
        changed |= cls._assign_numeric_field(
            component,
            "tape_width_mm",
            catalog_entry.tape_width_mm,
            overwrite=overwrite,
        )
        changed |= cls._assign_numeric_field(
            component,
            "pitch_mm",
            catalog_entry.pitch_mm,
            overwrite=overwrite,
        )
        changed |= cls._assign_text_field(
            component,
            "feeder_type",
            normalize_component_feeder_type(catalog_entry.feeder_type),
            overwrite=overwrite,
        )
        return changed

    @classmethod
    def apply_defaults_to_component(
        cls,
        db: Session,
        component: Component,
        *,
        overwrite: bool = False,
    ) -> bool:
        footprint = component.footprint_pnp or component.package
        catalog_entry = cls.get_catalog_entry(
            db,
            footprint,
            component_type=component.component_type,
        )
        return cls.apply_catalog_entry_to_component(
            component,
            catalog_entry,
            overwrite=overwrite,
        )

    @classmethod
    def synchronize_components(
        cls,
        db: Session,
        *,
        machine_footprints: Optional[Iterable[str]] = None,
        overwrite: bool = False,
    ) -> int:
        cls.ensure_passive_rule_expansion(db)
        normalized_targets = {
            cls.normalize_machine_footprint(value)
            for value in (machine_footprints or [])
            if cls.normalize_machine_footprint(value)
        }

        synchronized_count = 0
        components = db.query(Component).all()
        for component in components:
            normalized_component_footprint = cls.normalize_machine_footprint(
                component.footprint_pnp or component.package
            )
            if not normalized_component_footprint:
                continue
            if normalized_targets and normalized_component_footprint not in normalized_targets:
                continue

            if cls.apply_defaults_to_component(db, component, overwrite=overwrite):
                synchronized_count += 1

        return synchronized_count

    @classmethod
    def import_delimited_text(
        cls,
        payload: bytes,
        db: Session,
    ) -> MachineFootprintCatalogImportResult:
        cls.ensure_passive_rule_expansion(db)
        decoded_text = cls.decode_bytes(payload)
        reader = csv.reader(io.StringIO(decoded_text), delimiter=";")

        rows = [row for row in reader if any(cls.clean_text(cell) for cell in row)]
        if not rows:
            raise ValueError("Machine-footprint file is empty")

        column_indexes = cls.resolve_headers(rows[0])

        created_count = 0
        updated_count = 0
        skipped_count = 0
        item_count = 0
        errors: List[str] = []
        touched_footprints: List[str] = []

        for row_index, row in enumerate(rows[1:], start=2):
            machine_footprint = cls.normalize_machine_footprint(
                row[column_indexes["machine_footprint"]]
                if column_indexes["machine_footprint"] < len(row)
                else None
            )
            raw_component_type = cls.normalize_component_type(
                row[column_indexes["component_type"]]
                if "component_type" in column_indexes and column_indexes["component_type"] < len(row)
                else None
            )

            try:
                tape_width_mm = cls.normalize_float(
                    row[column_indexes["tape_width_mm"]]
                    if "tape_width_mm" in column_indexes and column_indexes["tape_width_mm"] < len(row)
                    else None,
                    "Tape_width_mm",
                )
                pitch_mm = cls.normalize_float(
                    row[column_indexes["pitch_mm"]]
                    if "pitch_mm" in column_indexes and column_indexes["pitch_mm"] < len(row)
                    else None,
                    "Pitch_mm",
                )
            except ValueError as exc:
                errors.append(f"Line {row_index}: {exc}")
                continue

            feeder_type_raw = (
                row[column_indexes["feeder_type"]]
                if "feeder_type" in column_indexes and column_indexes["feeder_type"] < len(row)
                else None
            )
            feeder_type = normalize_component_feeder_type(feeder_type_raw)
            if feeder_type is None and tape_width_mm is not None:
                feeder_type = feeder_type_from_size_mm(int(tape_width_mm))

            if not machine_footprint:
                errors.append(f"Line {row_index}: missing Footprint/MachineFootprint")
                continue

            item_count += 1
            expanded_component_types = cls.expand_component_types(raw_component_type)
            candidate_rules = (
                db.query(MachineFootprintRule)
                .filter(MachineFootprintRule.machine_footprint == machine_footprint)
                .all()
            )

            for component_type in expanded_component_types:
                rule = next(
                    (
                        candidate
                        for candidate in candidate_rules
                        if cls._match_rule_identity(
                            candidate,
                            component_type=component_type,
                            machine_footprint=machine_footprint,
                            tape_width_mm=tape_width_mm,
                            pitch_mm=pitch_mm,
                        )
                    ),
                    None,
                )

                is_new = rule is None
                if is_new:
                    rule = MachineFootprintRule(
                        component_type=component_type,
                        machine_footprint=machine_footprint,
                        tape_width_mm=tape_width_mm,
                        pitch_mm=pitch_mm,
                    )
                    db.add(rule)
                    candidate_rules.append(rule)

                changed = False
                if is_new:
                    changed = True

                if component_type is not None and rule.component_type != component_type:
                    rule.component_type = component_type
                    changed = True
                if rule.machine_footprint != machine_footprint:
                    rule.machine_footprint = machine_footprint
                    changed = True
                if tape_width_mm is not None and rule.tape_width_mm != tape_width_mm:
                    rule.tape_width_mm = tape_width_mm
                    changed = True
                if pitch_mm is not None and rule.pitch_mm != pitch_mm:
                    rule.pitch_mm = pitch_mm
                    changed = True
                if feeder_type is not None and rule.feeder_type != feeder_type:
                    rule.feeder_type = feeder_type
                    changed = True

                if is_new:
                    created_count += 1
                elif changed:
                    updated_count += 1
                else:
                    skipped_count += 1

            touched_footprints.append(machine_footprint)

        db.flush()

        synchronized_component_count = cls.synchronize_components(
            db,
            machine_footprints=touched_footprints,
            overwrite=False,
        )
        db.commit()

        return MachineFootprintCatalogImportResult(
            created_count=created_count,
            updated_count=updated_count,
            skipped_count=skipped_count,
            item_count=item_count,
            synchronized_component_count=synchronized_component_count,
            errors=errors,
        )
