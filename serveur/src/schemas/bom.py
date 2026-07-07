"""Schemas for BOM, component library, and review endpoints."""

from datetime import datetime
from typing import List, Optional

try:
    from typing import Literal
except ImportError:  # pragma: no cover - Python < 3.8 compatibility
    from typing_extensions import Literal

from pydantic import BaseModel, ConfigDict, Field


class OrmBaseModel(BaseModel):
    """Shared base model with ORM compatibility enabled."""

    model_config = ConfigDict(from_attributes=True)


class ComponentSchema(OrmBaseModel):
    id: Optional[int] = None
    reference: str
    value: Optional[str] = None
    mpn: Optional[str] = None
    component_type: Optional[str] = None
    package: Optional[str] = None
    tape_width_mm: Optional[float] = None
    pitch_mm: Optional[float] = None
    qty_per_reel: Optional[int] = None
    reel_outer_diameter_mm: Optional[float] = None
    reel_hub_diameter_mm: Optional[float] = None
    supplier_code: Optional[str] = None
    footprint_eagle: Optional[str] = None
    footprint_pnp: Optional[str] = None
    feeder_type: Optional[str] = None
    is_fixed_feeder: bool = False
    fixed_cart_id: Optional[int] = None
    fixed_cart_name: Optional[str] = None
    description: Optional[str] = None
    notes: Optional[str] = None
    version: Optional[int] = None


class ComponentLibraryImportResponse(BaseModel):
    success: bool
    message: str
    item_count: int
    created_count: int
    updated_count: int
    skipped_count: int = 0
    errors: List[str] = Field(default_factory=list)


class ComponentTypeRuleSchema(OrmBaseModel):
    id: Optional[int] = None
    reference_prefix: str
    mapped_type: Optional[str] = None
    requires_confirmation: bool = False
    priority: int = 100
    enabled: bool = True
    description: Optional[str] = None


class ComponentTypeRuleUpsertRequest(BaseModel):
    reference_prefix: str = Field(..., min_length=1, max_length=50)
    mapped_type: Optional[str] = Field(default=None, max_length=50)
    requires_confirmation: bool = False
    priority: int = Field(default=100, ge=0, le=9999)
    enabled: bool = True
    description: Optional[str] = Field(default=None, max_length=255)


class ComponentTypeRuleMutationResponse(BaseModel):
    success: bool
    message: str
    rule_count: int


class ComponentTypeRuleImportResponse(BaseModel):
    success: bool
    message: str
    item_count: int
    created_count: int
    updated_count: int
    skipped_count: int = 0
    errors: List[str] = Field(default_factory=list)


class ComponentTypeRuleReorderRequest(BaseModel):
    ordered_rule_ids: List[int] = Field(default_factory=list)


class ComponentTypeRuleReplaceRequest(BaseModel):
    rules: List[ComponentTypeRuleUpsertRequest] = Field(default_factory=list)


class MachineFootprintCatalogSchema(OrmBaseModel):
    id: Optional[int] = None
    component_type: Optional[str] = None
    machine_footprint: str
    tape_width_mm: Optional[float] = None
    pitch_mm: Optional[float] = None
    feeder_type: Optional[str] = None


class MachineFootprintCatalogImportResponse(BaseModel):
    success: bool
    message: str
    item_count: int
    created_count: int
    updated_count: int
    skipped_count: int = 0
    synchronized_component_count: int = 0
    errors: List[str] = Field(default_factory=list)


class FootprintMappingSchema(OrmBaseModel):
    id: Optional[int] = None
    footprint_eagle: str
    footprint_pnp: str
    machine_compatible: Optional[str] = None
    notes: Optional[str] = None


class FootprintMappingCreateSchema(BaseModel):
    footprint_eagle: str
    footprint_pnp: str
    machine_compatible: Optional[str] = None
    notes: Optional[str] = None


class BomItemSchema(OrmBaseModel):
    id: Optional[int] = None
    reference_item: str
    value_raw: Optional[str] = None
    value_harmonized: Optional[str] = None
    footprint_eagle: Optional[str] = None
    footprint_pnp: Optional[str] = None
    x: Optional[float] = None
    y: Optional[float] = None
    rotation: Optional[int] = None
    placement_side: Optional[str] = None
    component_type: Optional[str] = None
    quantity: int = 1
    dnp: bool = False
    notes: Optional[str] = None


class BomRevisionSchema(OrmBaseModel):
    id: Optional[int] = None
    revision: str
    type: str
    status: str = "DRAFT"
    created_at: Optional[datetime] = None
    item_count: Optional[int] = None


class BomReferenceSchema(OrmBaseModel):
    id: Optional[int] = None
    reference: str
    category: Optional[str] = None
    description: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class BomImportResponse(BaseModel):
    success: bool
    bom_reference_id: int
    bom_revision_id: int
    reference: Optional[str] = None
    revision: Optional[str] = None
    side: Optional[str] = None
    status: Optional[str] = None
    message: str
    item_count: int
    items: List[dict] = Field(default_factory=list)
    stats: dict = Field(default_factory=dict)
    errors: List[str] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)


class BomCategorySchema(OrmBaseModel):
    id: Optional[int] = None
    name: str
    description: Optional[str] = None
    reference_count: int = 0
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class BomCategoryCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(default=None, max_length=255)


class BomCategoryListResponse(BaseModel):
    items: List[BomCategorySchema] = Field(default_factory=list)


class BomStoredFileSchema(BaseModel):
    bom_reference_id: int
    bom_revision_id: int
    reference: str
    category: Optional[str] = None
    revision: str
    side: str
    status: str
    created_at: Optional[datetime] = None
    file_name: str
    file_path: str


class BomReferenceCategoryUpdateRequest(BaseModel):
    category: Optional[str] = Field(default=None, max_length=100)


class BomStoredFileListResponse(BaseModel):
    items: List[BomStoredFileSchema] = Field(default_factory=list)


class BomStoredFileUpdateRequest(BaseModel):
    reference: str = Field(..., min_length=1, max_length=100)
    revision: str = Field(..., min_length=1, max_length=20)


class BomStoredFileMutationResponse(BaseModel):
    success: bool
    message: str
    bom_reference_id: int
    bom_revision_id: int


class BomReviewItemPayload(BaseModel):
    id: int
    value_harmonized: Optional[str] = None
    footprint_pnp: Optional[str] = None
    component_type: Optional[str] = None
    component_type_confirmed: Optional[bool] = None
    notes: Optional[str] = None
    dnp: Optional[bool] = None


class BomItemInlineUpdateRequest(BaseModel):
    value_harmonized: Optional[str] = None
    footprint_pnp: Optional[str] = None
    create_mapping: bool = True


class BomReviewSaveRequest(BaseModel):
    items: List[BomReviewItemPayload] = Field(default_factory=list)
    create_mappings: bool = True
    mark_as_active: bool = True


class BomReviewSaveResponse(BaseModel):
    success: bool
    bom_reference_id: int
    bom_revision_id: int
    revision_status: str
    saved_mapping_count: int = 0
    message: str
    item_count: int
    items: List[dict] = Field(default_factory=list)
    stats: dict = Field(default_factory=dict)
    errors: List[str] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)


class ComponentTypeRefreshResponse(BaseModel):
    success: bool
    message: str
    updated_component_count: int = 0
    updated_bom_item_count: int = 0
    inferred_type_count: int = 0
    ambiguous_component_count: int = 0
    manual_preserved_count: int = 0
    skipped_count: int = 0
    ambiguous_component_ids: List[int] = Field(default_factory=list)


class MissingComponentResolutionRequest(BaseModel):
    action: Literal["register", "delete"]
    item_ids: List[int] = Field(default_factory=list, min_items=1)
    component_name: Optional[str] = None


class MissingComponentResolutionResponse(BaseModel):
    success: bool
    bom_reference_id: int
    bom_revision_id: int
    reference: Optional[str] = None
    revision: Optional[str] = None
    side: Optional[str] = None
    status: Optional[str] = None
    action: str
    message: str
    item_count: int
    items: List[dict] = Field(default_factory=list)
    stats: dict = Field(default_factory=dict)
    errors: List[str] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    component: Optional[ComponentSchema] = None


class MissingFootprintResolutionRequest(BaseModel):
    item_ids: List[int] = Field(default_factory=list, min_items=1)
    footprint_pnp: str


class BomDetailResponse(BaseModel):
    reference: BomReferenceSchema
    revisions: List[BomRevisionSchema]
    total_items: int


class BomRevisionDetailResponse(BaseModel):
    revision: BomRevisionSchema
    items: List[BomItemSchema]
