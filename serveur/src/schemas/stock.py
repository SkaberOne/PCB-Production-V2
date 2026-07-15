"""Pydantic schemas for the physical component stock routes (ADR 0010)."""

from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator

from ..models.stock import StockConditionnement, StockMotif, StockSens


# ------------------------------------------------------------------ requests
class MovementCreateRequest(BaseModel):
    """Create a manual movement: ``declaration`` (set-to recount), ``correction``
    (set-to inventory) or ``reception`` (additive manual reception from the Stock
    tab). ``production`` and auto command receptions are posted by the system."""

    component_id: int = Field(..., gt=0)
    motif: Literal["declaration", "correction", "reception"]
    # declaration (set-to recount from BomStockDialog) — piece counts per form:
    qty_reel: int = Field(default=0, ge=0)
    qty_bag: int = Field(default=0, ge=0)
    qty_tube: int = Field(default=0, ge=0)
    # correction (periodic recount) — new absolute balance:
    new_total: Optional[int] = None
    # reception (manual add) — quantity received to add to the balance:
    qty: int = Field(default=0, ge=0)
    note: Optional[str] = Field(default=None, max_length=500)


class NewComponentIn(BaseModel):
    """Composant à créer au moment de la réception (feature réception, ADR 0015).

    Le MPN est obligatoire (identifiant fournisseur) ; le reste est optionnel et
    complétable plus tard depuis le catalogue.
    """

    mpn: str = Field(..., min_length=1, max_length=200)
    value: Optional[str] = Field(default=None, max_length=100)
    footprint: Optional[str] = Field(default=None, max_length=100)
    component_type: Optional[str] = Field(default=None, max_length=50)
    description: Optional[str] = Field(default=None, max_length=500)


class ReceptionCreateRequest(BaseModel):
    """Réception manuelle : composant existant (``component_id``) OU nouveau
    composant (``new_component``) créé à la volée. Exactement l'un des deux."""

    component_id: Optional[int] = Field(default=None, gt=0)
    new_component: Optional[NewComponentIn] = None
    qty: int = Field(..., gt=0)
    note: Optional[str] = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def _exactly_one_target(self):
        if bool(self.component_id) == bool(self.new_component):
            raise ValueError(
                "Fournir exactement un de component_id ou new_component"
            )
        return self


class ComponentParamsRequest(BaseModel):
    """Per-component thresholds. Both fields optional; ``loss_pct=null`` clears the
    override (falls back to the global coefficient)."""

    model_config = ConfigDict(extra="forbid")

    safety_stock: Optional[int] = Field(default=None, ge=0)
    loss_pct: Optional[float] = Field(default=None, ge=0)


class GlobalSettingsRequest(BaseModel):
    global_loss_pct: float = Field(..., ge=0)


# ----------------------------------------------------------------- responses
class StockLineOut(BaseModel):
    component_id: int
    reference: Optional[str] = None
    value: Optional[str] = None
    mpn: Optional[str] = None
    component_type: Optional[str] = None
    footprint_eagle: Optional[str] = None
    footprint_pnp: Optional[str] = None
    qty_pieces: int
    qty_reel: int
    qty_bag: int
    qty_tube: int
    engaged: int = 0
    libre: int = 0
    safety_stock: int
    loss_pct: Optional[float] = None
    effective_loss_pct: float
    has_stock_row: bool
    status: str
    verified_at: Optional[str] = None
    verified_qty: Optional[int] = None


class ComponentStockOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    component_id: int
    qty_pieces: int
    qty_reel: int
    qty_bag: int
    qty_tube: int
    safety_stock: int
    loss_pct: Optional[float] = None
    updated_at: Optional[datetime] = None


class MovementOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    component_id: int
    sens: StockSens
    qty: int
    signed_qty: int
    motif: StockMotif
    conditionnement: Optional[StockConditionnement] = None
    source_type: str
    source_id: Optional[str] = None
    production_run_id: Optional[int] = None
    date: Optional[datetime] = None
    note: Optional[str] = None
    created_by: Optional[str] = None
    is_reversed: bool
    reverses_id: Optional[int] = None


class ReceptionComponentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    reference: Optional[str] = None
    value: Optional[str] = None
    mpn: Optional[str] = None
    component_type: Optional[str] = None
    footprint_eagle: Optional[str] = None
    footprint_pnp: Optional[str] = None


class ReceptionOut(BaseModel):
    component: ReceptionComponentOut
    component_created: bool
    stock: ComponentStockOut


class SettingsOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    global_loss_pct: float
    updated_at: Optional[datetime] = None


class StockListOut(BaseModel):
    items: List[StockLineOut]


# ---------------------------------------------------------- Phase 2 (ADR 0011)
class ProduceRequest(BaseModel):
    """Close a production batch: real number of boards produced."""

    boards_produced: int = Field(..., ge=0)
    note: Optional[str] = Field(default=None, max_length=500)


class RunOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    production_id: int
    machine_id: Optional[int] = None
    boards_produced: int
    note: Optional[str] = None
    is_cancelled: bool
    created_at: Optional[datetime] = None


class CanProduceLine(BaseModel):
    component_id: int
    reference: Optional[str] = None
    value: Optional[str] = None
    mpn: Optional[str] = None
    footprint: Optional[str] = None
    besoin: int
    solde: int
    reserve: int
    engage: int = 0
    disponible: int
    manque: int
    a_commander: int
    qty_reel: int = 0
    qty_bag: int = 0
    qty_tube: int = 0
    verified_at: Optional[str] = None
    verified_qty: Optional[int] = None


class CanProduceOut(BaseModel):
    production_id: int
    production_name: Optional[str] = None
    board_count: int
    can_produce: bool
    shortage_count: int
    lines: List[CanProduceLine]


# ---- Phase 3 : stock engagé sur feeders (ADR 0012) ----
class SetLoadRequest(BaseModel):
    """Set-to the loaded quantity for (machine, component). 0 = déchargé."""

    qty_loaded: int = Field(..., ge=0)
    note: Optional[str] = Field(default=None, max_length=500)


class MachineLoadOut(BaseModel):
    machine_id: int
    component_id: int
    value: Optional[str] = None
    mpn: Optional[str] = None
    footprint: Optional[str] = None
    qty_loaded: int
    note: Optional[str] = None
