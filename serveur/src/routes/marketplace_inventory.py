"""Marketplace feeder, cart, and fixed-feeder routes."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas.marketplace import (
    CreateCartRequest,
    CreateFeederTypeRequest,
    UpdateCartRequest,
    UpdateFeederTypeRequest,
    UpdateFixedFeederComponentRequest,
)
from ..services.assignment_service import AssignmentService

router = APIRouter()


@router.post("/carts", response_model=dict)
def create_cart(
    request: CreateCartRequest,
    db: Session = Depends(get_db),
):
    """Create a logical feeder cart for fixed components."""
    try:
        cart = AssignmentService.create_cart(
            db=db,
            name=request.name,
            kind=request.kind,
            target_category=request.target_category,
            capacity_positions=request.capacity_positions,
            description=request.description,
            notes=request.notes,
        )
        return {"message": "Cart created", "cart_id": cart.id}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating cart: {str(e)}")


@router.get("/carts/{cart_id}")
def get_cart(
    cart_id: int,
    db: Session = Depends(get_db),
):
    """Get cart by ID."""
    cart = AssignmentService.get_cart_by_id(db=db, cart_id=cart_id)
    if not cart:
        raise HTTPException(status_code=404, detail=f"Cart {cart_id} not found")
    return AssignmentService._serialize_cart(cart)


@router.get("/carts")
def list_carts(
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """List all logical feeder carts."""
    try:
        carts, total = AssignmentService.list_carts(
            db=db,
            limit=limit,
            offset=offset,
        )
        return {
            "data": carts,
            "total": total,
            "limit": limit,
            "offset": offset,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error listing carts: {str(e)}")


@router.post("/fixed-feeders/calculate")
def calculate_fixed_feeders(
    db: Session = Depends(get_db),
):
    """Calculate automatic fixed-feeder assignments from BOM usage."""
    try:
        result = AssignmentService.calculate_fixed_feeders(db=db)
        return {
            "message": (
                f"{result['assigned_count']} composant(s) fixe(s) calcules "
                f"({result['assigned_common_count']} recurrent(s), {result['assigned_category_count']} par categorie)."
            ),
            **result,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error calculating fixed feeders: {str(e)}")


@router.get("/fixed-feeders/components")
def list_fixed_feeder_components(
    search: Optional[str] = Query(None),
    only_fixed: bool = Query(True),
    limit: int = Query(200, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """List fixed feeders or candidate components with BOM usage metrics."""
    try:
        rows, total, unmatched_bom_items = AssignmentService.list_fixed_feeder_components(
            db=db,
            search=search,
            only_fixed=only_fixed,
            limit=limit,
            offset=offset,
        )
        return {
            "data": rows,
            "total": total,
            "limit": limit,
            "offset": offset,
            "unmatched_bom_items": unmatched_bom_items,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error listing fixed feeders: {str(e)}")


@router.patch("/fixed-feeders/components/{component_id}")
def update_fixed_feeder_component(
    component_id: int,
    request: UpdateFixedFeederComponentRequest,
    db: Session = Depends(get_db),
):
    """Update fixed-feeder settings for a component."""
    try:
        component = AssignmentService.update_fixed_feeder_component(
            db=db,
            component_id=component_id,
            is_fixed_feeder=request.is_fixed_feeder,
            fixed_cart_id=request.fixed_cart_id,
            fixed_cart_id_provided="fixed_cart_id" in getattr(request, "__fields_set__", set()),
            feeder_id=request.feeder_id,
        )
        return {
            "message": "Fixed feeder updated",
            "component_id": component.id,
            "reference": component.reference,
            "is_fixed_feeder": bool(component.is_fixed_feeder),
            "fixed_cart_id": component.fixed_cart_id,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating fixed feeder: {str(e)}")


@router.put("/carts/{cart_id}", response_model=dict)
def update_cart(
    cart_id: int,
    request: UpdateCartRequest,
    db: Session = Depends(get_db),
):
    """Update a logical feeder cart."""
    try:
        AssignmentService.update_cart(
            db=db,
            cart_id=cart_id,
            name=request.name,
            kind=request.kind,
            target_category=request.target_category,
            capacity_positions=request.capacity_positions,
            description=request.description,
            notes=request.notes,
        )
        return {"message": "Cart updated"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating cart: {str(e)}")


@router.delete("/carts/{cart_id}")
def delete_cart(
    cart_id: int,
    db: Session = Depends(get_db),
):
    """Delete a logical feeder cart."""
    try:
        deleted = AssignmentService.delete_cart(db=db, cart_id=cart_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Cart not found")
        return {"message": "Cart deleted"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting cart: {str(e)}")


@router.post("/feeder-types", response_model=dict)
def create_feeder_type(
    request: CreateFeederTypeRequest,
    db: Session = Depends(get_db),
):
    """Create a new feeder type."""
    try:
        feeder = AssignmentService.create_feeder_type(
            db=db,
            size_mm=request.size_mm,
            capacity=request.capacity,
            description=request.description,
            notes=request.notes,
        )
        return {"message": "Feeder type created", "feeder_id": feeder.id}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating feeder: {str(e)}")


@router.get("/feeder-types/{feeder_id}")
def get_feeder_type(
    feeder_id: int,
    db: Session = Depends(get_db),
):
    """Get feeder type by ID."""
    feeder = AssignmentService.get_feeder_by_id(db=db, feeder_id=feeder_id)
    if not feeder:
        raise HTTPException(status_code=404, detail=f"Feeder {feeder_id} not found")
    return {
        "id": feeder.id,
        "size_mm": feeder.size_mm,
        "capacity": feeder.capacity,
        "description": feeder.description,
        "notes": feeder.notes,
    }


@router.get("/feeder-types")
def list_feeder_types(
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """List all feeder types."""
    try:
        feeders, total = AssignmentService.list_feeders(
            db=db,
            limit=limit,
            offset=offset,
        )
        return {
            "data": [
                {
                    "id": f.id,
                    "size_mm": f.size_mm,
                    "capacity": f.capacity,
                    "description": f.description,
                }
                for f in feeders
            ],
            "total": total,
            "limit": limit,
            "offset": offset,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error listing feeders: {str(e)}")


@router.put("/feeder-types/{feeder_id}", response_model=dict)
def update_feeder_type(
    feeder_id: int,
    request: UpdateFeederTypeRequest,
    db: Session = Depends(get_db),
):
    """Update feeder type information."""
    try:
        feeder = AssignmentService.update_feeder(
            db=db,
            feeder_id=feeder_id,
            capacity=request.capacity,
            description=request.description,
            notes=request.notes,
        )
        return {"message": "Feeder type updated"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating feeder: {str(e)}")


@router.post("/machines/{machine_id}/feeder-types/{feeder_id}")
def assign_feeder_to_machine(
    machine_id: int,
    feeder_id: int,
    db: Session = Depends(get_db),
):
    """Assign a feeder type to a machine."""
    try:
        assigned = AssignmentService.assign_feeder_to_machine(
            db=db,
            machine_id=machine_id,
            feeder_id=feeder_id,
        )
        if assigned:
            return {"message": "Feeder assigned to machine"}
        return {"message": "Feeder already assigned to machine"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error assigning feeder: {str(e)}")


@router.delete("/machines/{machine_id}/feeder-types/{feeder_id}")
def remove_feeder_from_machine(
    machine_id: int,
    feeder_id: int,
    db: Session = Depends(get_db),
):
    """Remove a feeder type from a machine."""
    try:
        removed = AssignmentService.remove_feeder_from_machine(
            db=db,
            machine_id=machine_id,
            feeder_id=feeder_id,
        )
        if removed:
            return {"message": "Feeder removed from machine"}
        return {"message": "Feeder not assigned to this machine"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error removing feeder: {str(e)}")


@router.delete("/feeder-types/{feeder_id}")
def delete_feeder_type(
    feeder_id: int,
    db: Session = Depends(get_db),
):
    """Delete a feeder type."""
    try:
        deleted = AssignmentService.delete_feeder(db=db, feeder_id=feeder_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Feeder not found")
        return {"message": "Feeder type deleted"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting feeder: {str(e)}")
