"""Pydantic schemas for marketplace routes."""

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field


class CreateCommandRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    notes: Optional[str] = None
    production_id: Optional[int] = Field(default=None, gt=0)


class UpdateCommandRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    status: Optional[str] = None
    notes: Optional[str] = None


class AddCommandItemRequest(BaseModel):
    bom_revision_id: int = Field(..., gt=0)
    quantity: int = Field(default=1, gt=0)


class GenerateCommandRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    notes: Optional[str] = None
    production_id: Optional[int] = Field(default=None, gt=0)
    items: List[AddCommandItemRequest]


class SyncProductionCommandRequest(BaseModel):
    """Upsert the implicit per-production command from the current BOM selection."""

    items: List[AddCommandItemRequest] = Field(default_factory=list)


class SetReceiptRequest(BaseModel):
    """Set the received quantity for one command line (aggregate key)."""

    line_key: str = Field(..., min_length=1, max_length=300)
    qty_received: int = Field(..., ge=0)


class SetLineDetailRequest(BaseModel):
    """Complétion manuelle d'une ligne de commande (popup page Commande)."""

    line_key: str = Field(..., min_length=1, max_length=300)
    mpn: Optional[str] = Field(default=None, max_length=200)
    quantity_to_order: Optional[int] = Field(default=None, ge=0)
    note: Optional[str] = Field(default=None, max_length=1000)
    supplier: Optional[str] = Field(default=None, max_length=80)
    supplier_part: Optional[str] = Field(default=None, max_length=200)
    unit_price: Optional[float] = Field(default=None, ge=0)
    currency: Optional[str] = Field(default=None, max_length=8)
    product_url: Optional[str] = Field(default=None, max_length=2000)
    component_library_id: Optional[int] = Field(default=None, gt=0)


class CreateProductionRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    machine_id: Optional[int] = Field(default=None, gt=0)
    # Mode d'assemblage : PNP (défaut), MANUEL (à la main), MIXTE.
    assembly_mode: Optional[str] = Field(default=None, max_length=10)
    notes: Optional[str] = Field(default=None, max_length=500)


class UpdateProductionRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    machine_id: Optional[int] = Field(default=None, gt=0)
    assembly_mode: Optional[str] = Field(default=None, max_length=10)
    status: Optional[str] = Field(default=None, max_length=50)
    notes: Optional[str] = Field(default=None, max_length=500)
    # Concurrence optimiste (ADR 0013 extension B) : optionnel. Si fourni et
    # différent de la version en base -> 409 (un autre poste a modifié entre-temps).
    version: Optional[int] = Field(default=None, ge=0)


class UpdateErpContextRequest(BaseModel):
    erp_context: Dict[str, Any] = Field(default_factory=dict)


class AttachProductionBomRequest(BaseModel):
    bom_revision_ids: List[int] = Field(..., min_items=1)


class UpdateProductionBomQuantityItemRequest(BaseModel):
    bom_revision_id: int = Field(..., gt=0)
    quantity_to_produce: int = Field(..., gt=0)


class UpdateProductionBomQuantitiesRequest(BaseModel):
    items: List[UpdateProductionBomQuantityItemRequest] = Field(..., min_items=1)


class UpdateCommandItemQuantityRequest(BaseModel):
    quantity: int = Field(..., gt=0)


class ExportCommandErpRequest(BaseModel):
    """ERP purchase-list export. All context fields fall back to ERP defaults."""

    project: Optional[str] = Field(default=None, max_length=250)
    unit: Optional[str] = Field(default=None, max_length=50)
    requester: Optional[str] = Field(default=None, max_length=150)
    validator: Optional[str] = Field(default=None, max_length=150)
    delay: Optional[str] = Field(default=None, max_length=100)
    remark: Optional[str] = Field(default=None, max_length=500)
    default_supplier: Optional[str] = Field(default=None, max_length=50)
    sort_strategy: str = Field(default="cheapest", pattern="^(cheapest|priority)$")
    priority_supplier: Optional[str] = Field(default=None, max_length=20)
    line_overrides: Optional[List[dict]] = Field(default=None)


class UpdateErpDefaultsRequest(BaseModel):
    project: Optional[str] = Field(default=None, max_length=250)
    unit: Optional[str] = Field(default=None, max_length=50)
    requester: Optional[str] = Field(default=None, max_length=150)
    validator: Optional[str] = Field(default=None, max_length=150)
    delay: Optional[str] = Field(default=None, max_length=100)
    remark: Optional[str] = Field(default=None, max_length=500)
    default_supplier: Optional[str] = Field(default=None, max_length=50)


class SupplierOfferRefreshRequest(BaseModel):
    """Force a real-time refresh of supplier offers for the given components."""

    component_ids: List[int] = Field(..., min_items=1)


class CreateProductionPlanRequest(BaseModel):
    machine_id: int = Field(..., gt=0)
    notes: Optional[str] = None


class AutoAssignComponentsRequest(BaseModel):
    strategy: str = Field(default="by_type", pattern="^(by_type|by_quantity|by_value)$")


class ManualAssignComponentRequest(BaseModel):
    feeder_position: int = Field(..., ge=1, le=200)
    component_id: int = Field(..., gt=0)
    quantity: int = Field(..., gt=0)


class UpdatePlanAssignmentRequest(BaseModel):
    new_quantity: Optional[int] = Field(None, gt=0)
    new_position: Optional[int] = Field(None, ge=1, le=200)


class CreateMachineRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    num_positions: int = Field(..., ge=1, le=200)
    num_nozzles: Optional[int] = Field(default=None, ge=0, le=40)
    nozzle_layout: Optional[List[int]] = Field(default=None)
    export_format: Optional[str] = Field(default=None, pattern="^(CSV|TXT)$")
    export_columns: Optional[List[str]] = Field(default=None)
    export_separator: Optional[str] = Field(default=None, pattern="^[,;]$")
    feeder_back_order: Optional[str] = Field(default=None, pattern="^(ASC|DESC)$")
    description: Optional[str] = None
    notes: Optional[str] = None


class UpdateMachineRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    num_positions: Optional[int] = Field(default=None, ge=1, le=200)
    num_nozzles: Optional[int] = Field(default=None, ge=0, le=40)
    nozzle_layout: Optional[List[int]] = Field(default=None)
    export_format: Optional[str] = Field(default=None, pattern="^(CSV|TXT)$")
    export_columns: Optional[List[str]] = Field(default=None)
    export_separator: Optional[str] = Field(default=None, pattern="^[,;]$")
    feeder_back_order: Optional[str] = Field(default=None, pattern="^(ASC|DESC)$")
    description: Optional[str] = None
    notes: Optional[str] = None


class CreateFeederTypeRequest(BaseModel):
    size_mm: int = Field(..., ge=1, le=100)
    capacity: Optional[int] = None
    description: Optional[str] = None
    notes: Optional[str] = None


class UpdateFeederTypeRequest(BaseModel):
    capacity: Optional[int] = None
    description: Optional[str] = None
    notes: Optional[str] = None


class CreateCartRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    kind: str = Field(default="CUSTOM", max_length=50)
    target_category: Optional[str] = Field(default=None, max_length=100)
    capacity_positions: int = Field(default=80, ge=1, le=500)
    description: Optional[str] = None
    notes: Optional[str] = None


class UpdateCartRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    kind: Optional[str] = Field(default=None, max_length=50)
    target_category: Optional[str] = Field(default=None, max_length=100)
    capacity_positions: Optional[int] = Field(default=None, ge=1, le=500)
    description: Optional[str] = None
    notes: Optional[str] = None


class UpdateFixedFeederComponentRequest(BaseModel):
    is_fixed_feeder: bool = Field(default=True)
    fixed_cart_id: Optional[int] = Field(default=None, gt=0)
    feeder_id: Optional[int] = Field(default=None, gt=0)


class UpdateMachineProductionBomOrderRequest(BaseModel):
    bom_revision_ids: List[int] = Field(..., min_items=1)


class CommandResponse(BaseModel):
    id: int
    name: str
    production_id: Optional[int] = None
    status: str
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
