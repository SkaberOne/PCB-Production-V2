"""Marketplace production-plan endpoints scoped under commands."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas.marketplace import (
    AutoAssignComponentsRequest,
    CreateProductionPlanRequest,
    ManualAssignComponentRequest,
    UpdatePlanAssignmentRequest,
)
from ..services.production_service import ProductionService

router = APIRouter(prefix="/{command_id}/plans")


@router.post("", response_model=dict)
def create_production_plan(
    command_id: int,
    request: CreateProductionPlanRequest,
    db: Session = Depends(get_db),
):
    """Create a production plan for a command on a specific machine."""
    try:
        plan = ProductionService.create_production_plan(
            db=db,
            command_id=command_id,
            machine_id=request.machine_id,
            notes=request.notes,
        )
        return {"message": "Production plan created", "plan_id": plan.id}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error creating plan: {exc}")


@router.get("")
def list_command_plans(
    command_id: int,
    db: Session = Depends(get_db),
):
    """Get all production plans for a command."""
    try:
        plans = ProductionService.list_plans_by_command(db=db, command_id=command_id)
        return {
            "data": [{"id": p.id, "machine_id": p.machine_id, "created_at": p.created_at.isoformat()} for p in plans],
            "total": len(plans),
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error listing plans: {exc}")


@router.get("/{plan_id}/summary")
def get_plan_summary(
    command_id: int,
    plan_id: int,
    db: Session = Depends(get_db),
):
    """Get detailed summary of a production plan."""
    try:
        return ProductionService.get_plan_summary(db=db, plan_id=plan_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error getting plan summary: {exc}")


@router.post("/{plan_id}/auto-assign")
def auto_assign_components(
    command_id: int,
    plan_id: int,
    request: AutoAssignComponentsRequest,
    db: Session = Depends(get_db),
):
    """Automatically assign components to machine feeders."""
    try:
        count, details = ProductionService.auto_assign_components(
            db=db,
            plan_id=plan_id,
            strategy=request.strategy,
        )
        return {
            "message": "Components auto-assigned",
            "assignments_count": count,
            "strategy": request.strategy,
            "details": details,
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error auto-assigning: {exc}")


@router.post("/{plan_id}/assignments")
def manual_assign_component(
    command_id: int,
    plan_id: int,
    request: ManualAssignComponentRequest,
    db: Session = Depends(get_db),
):
    """Manually assign a component to a specific feeder position."""
    try:
        assignment = ProductionService.manual_assign_component(
            db=db,
            plan_id=plan_id,
            feeder_position=request.feeder_position,
            component_id=request.component_id,
            quantity=request.quantity,
        )
        return {"message": "Component assigned", "assignment_id": assignment.id}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error assigning component: {exc}")


@router.put("/{plan_id}/assignments/{assignment_id}")
def update_plan_assignment(
    command_id: int,
    plan_id: int,
    assignment_id: int,
    request: UpdatePlanAssignmentRequest,
    db: Session = Depends(get_db),
):
    """Update an existing plan assignment."""
    try:
        assignment = ProductionService.update_assignment(
            db=db,
            assignment_id=assignment_id,
            new_quantity=request.new_quantity,
            new_position=request.new_position,
        )
        return {"message": "Assignment updated", "assignment_id": assignment.id}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error updating assignment: {exc}")


@router.delete("/{plan_id}/assignments/{assignment_id}")
def remove_plan_assignment(
    command_id: int,
    plan_id: int,
    assignment_id: int,
    db: Session = Depends(get_db),
):
    """Remove a component assignment from a production plan."""
    try:
        removed = ProductionService.remove_assignment(db=db, assignment_id=assignment_id)
        if not removed:
            raise HTTPException(status_code=404, detail="Assignment not found")
        return {"message": "Assignment removed"}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error removing assignment: {exc}")


@router.post("/{plan_id}/validate")
def validate_plan_completeness(
    command_id: int,
    plan_id: int,
    db: Session = Depends(get_db),
):
    """Validate if all components from command are assigned in plan."""
    try:
        return ProductionService.validate_plan_completeness(db=db, plan_id=plan_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error validating plan: {exc}")


@router.delete("/{plan_id}")
def delete_production_plan(
    command_id: int,
    plan_id: int,
    db: Session = Depends(get_db),
):
    """Delete a production plan."""
    try:
        deleted = ProductionService.delete_plan(db=db, plan_id=plan_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Plan not found")
        return {"message": "Production plan deleted"}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error deleting plan: {exc}")
