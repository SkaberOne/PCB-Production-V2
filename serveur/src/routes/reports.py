"""API routes for reporting and analytics."""

from typing import Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..services.report_service import ReportService


class OverviewResponse(BaseModel):
    totals: Dict[str, int]
    commands_by_status: Dict[str, int]


router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/overview", response_model=OverviewResponse)
def get_overview(db: Session = Depends(get_db)):
    """Get dashboard overview metrics."""
    return ReportService.get_overview(db=db)


@router.get("/productions-summary")
def get_productions_summary(
    include_finished: bool = Query(False),
    db: Session = Depends(get_db),
):
    """Résumé par production pour les cartes du dashboard (en cours par défaut)."""
    return ReportService.get_productions_summary(db=db, include_finished=include_finished)


@router.get("/productions-history")
def get_productions_history(
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    """Historique des productions terminées, datées de leur clôture (récentes d'abord)."""
    return ReportService.get_productions_history(db=db, limit=limit)


@router.get("/bom-stats")
def get_bom_stats(production_id: Optional[int] = Query(None, ge=1), db: Session = Depends(get_db)):
    """Get BOM review KPI stats (total items, footprints mapped, items to verify).

    Optional ?production_id=<id> scopes the stats to the revisions linked to that production.
    """
    return ReportService.get_bom_stats(db=db, production_id=production_id)


@router.get("/commands/{command_id}")
def get_command_report(command_id: int, db: Session = Depends(get_db)):
    """Get a detailed report for a specific command."""
    try:
        return ReportService.get_command_report(db=db, command_id=command_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/machines")
def list_machine_utilization(db: Session = Depends(get_db)):
    """Get utilization metrics for all machines."""
    return ReportService.list_machine_utilization(db=db)


@router.get("/components/top")
def top_components(limit: int = Query(10, ge=1, le=50), db: Session = Depends(get_db)):
    """Get top used components across all commands."""
    return ReportService.list_top_components(db=db, limit=limit)
