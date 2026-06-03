"""Read/update the ERP export default values (single-row ERP_DEFAULTS table).

Seeded from settings on first access; editable from the admin screen.
See ADR 0004 / audit 2026-06-03 §6.2.
"""

from __future__ import annotations

from typing import Dict, Optional

from sqlalchemy.orm import Session

from ..config import settings
from ..models.commands import ErpDefaults

FIELDS = ("project", "unit", "requester", "validator", "delay", "remark", "default_supplier")


class ErpDefaultsService:
    @staticmethod
    def _seed_values() -> Dict[str, Optional[str]]:
        return {
            "project": settings.erp_default_project,
            "unit": settings.erp_default_unit,
            "requester": settings.erp_default_requester,
            "validator": settings.erp_default_validator,
            "delay": settings.erp_default_delay,
            "remark": settings.erp_default_remark,
            "default_supplier": None,
        }

    @classmethod
    def get_or_seed(cls, db: Session) -> ErpDefaults:
        row = db.query(ErpDefaults).order_by(ErpDefaults.id).first()
        if row is None:
            row = ErpDefaults(**cls._seed_values())
            db.add(row)
            db.commit()
            db.refresh(row)
        return row

    @classmethod
    def as_dict(cls, db: Session) -> Dict[str, Optional[str]]:
        row = cls.get_or_seed(db)
        return {field: getattr(row, field) for field in FIELDS}

    @classmethod
    def update(cls, db: Session, values: Dict[str, Optional[str]]) -> Dict[str, Optional[str]]:
        row = cls.get_or_seed(db)
        for field in FIELDS:
            if field in values and values[field] is not None:
                setattr(row, field, values[field])
        db.commit()
        db.refresh(row)
        return {field: getattr(row, field) for field in FIELDS}
