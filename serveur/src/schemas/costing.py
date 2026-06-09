"""Pydantic schemas for costing routes (« Prix carte »). See ADR 0005."""

from typing import Optional

from pydantic import BaseModel, Field


class UpdateCostParametersRequest(BaseModel):
    labor_rate: Optional[float] = Field(None, ge=0)
    vat_pct: Optional[float] = Field(None, ge=0)
    solder_paste_per_board: Optional[float] = Field(None, ge=0)
    defect_rate_pct: Optional[float] = Field(None, ge=0, le=100)
    repair_time_h: Optional[float] = Field(None, ge=0)
    test_time_h: Optional[float] = Field(None, ge=0)
    prep_time_bom_h: Optional[float] = Field(None, ge=0)
    prep_time_top_h: Optional[float] = Field(None, ge=0)
    prep_time_bot_h: Optional[float] = Field(None, ge=0)


class UpdateCostInputRequest(BaseModel):
    quantity_produced: Optional[int] = Field(None, ge=1)
    pcb_total_price: Optional[float] = Field(None, ge=0)
    stencil_cost: Optional[float] = Field(None, ge=0)
    amortize_stencil: Optional[bool] = None
    assembly_time_top_h: Optional[float] = Field(None, ge=0)
    assembly_time_bot_h: Optional[float] = Field(None, ge=0)
    tht_time_h: Optional[float] = Field(None, ge=0)
