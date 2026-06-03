"""ERP export defaults endpoints (admin screen).

GET returns the current defaults (seeded from settings on first call).
PUT updates them. See ADR 0004 / audit 2026-06-03 §6.2.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas.marketplace import UpdateErpDefaultsRequest
from ..services.erp_defaults_service import ErpDefaultsService

router = APIRouter(prefix="/erp-defaults", tags=["erp-defaults"])


@router.get("")
def get_erp_defaults(db: Session = Depends(get_db)):
    """Return the current ERP export defaults."""
    return ErpDefaultsService.as_dict(db)


@router.put("")
def update_erp_defaults(
    request: UpdateErpDefaultsRequest,
    db: Session = Depends(get_db),
):
    """Update the ERP export defaults from the admin screen."""
    try:
        return ErpDefaultsService.update(db, request.model_dump())
    except Exception as exc:  # pragma: no cover - defensive
        raise HTTPException(status_code=500, detail=f"Error updating ERP defaults: {exc}")
