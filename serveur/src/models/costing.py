"""SQLAlchemy models for production costing (« Prix carte »).

Three tables (see ADR 0005 / docs/audits/Audit_2026-06-09_prix_carte_production.md):

- ``COST_PARAMETERS``      : single-row workshop parameters (rates, VAT, times).
- ``PRODUCTION_COST_INPUT``: per-production non-material inputs (1:1 with a production).
- ``PRODUCTION_COSTING``   : frozen snapshot = per-card price history (latest = reference).

Decisions (audit §6): coût de revient seul (no margin), single burdened labor rate,
hybrid assembly time (auto + manual override), aggregated TOP+BOT price. The reserved
columns (machine/overhead/margin/sell) anticipate later extension without a refactor.
"""

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, Text
from sqlalchemy.orm import relationship

from ..database import Base, utcnow


class CostParameters(Base):
    """Single-row workshop costing parameters. Seeded on first read, editable in UI."""

    __tablename__ = "COST_PARAMETERS"

    id = Column(Integer, primary_key=True, index=True)
    labor_rate = Column(Float, nullable=False, default=40.0)            # €/h, taux unique chargé
    vat_pct = Column(Float, nullable=False, default=20.0)               # %
    solder_paste_per_board = Column(Float, nullable=False, default=2.0)  # €/carte
    defect_rate_pct = Column(Float, nullable=False, default=10.0)        # %
    repair_time_h = Column(Float, nullable=False, default=3.0)           # h (test inclus)
    test_time_h = Column(Float, nullable=False, default=1.0)             # h/carte
    prep_time_bom_h = Column(Float, nullable=False, default=0.1)         # h, NRE amorti
    prep_time_top_h = Column(Float, nullable=False, default=0.1)         # h, NRE amorti
    prep_time_bot_h = Column(Float, nullable=False, default=0.0)         # h, NRE amorti

    # Réservés pour extension (non exposés en v1) — cf. ADR 0005.
    machine_rate = Column(Float, nullable=True)
    overhead_rate = Column(Float, nullable=True)
    margin_pct = Column(Float, nullable=True)

    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    def __repr__(self):
        return f"<CostParameters labor_rate={self.labor_rate} vat={self.vat_pct}>"


class ProductionCostInput(Base):
    """Non-material costing inputs for one production (1:1). Overrides workshop defaults."""

    __tablename__ = "PRODUCTION_COST_INPUT"

    id = Column(Integer, primary_key=True, index=True)
    production_id = Column(
        Integer, ForeignKey("PRODUCTIONS.id"), nullable=False, unique=True, index=True
    )
    quantity_produced = Column(Integer, nullable=True)        # distinct de quantity_to_produce
    pcb_total_price = Column(Float, nullable=True)            # achat PCB nu, total série
    stencil_cost = Column(Float, nullable=True)              # coût stencil(s)
    amortize_stencil = Column(
        Boolean, nullable=False, default=True, server_default="1"
    )                                                        # corrige le bug Excel
    assembly_time_top_h = Column(Float, nullable=True)        # surcharge manuelle (sinon auto)
    assembly_time_bot_h = Column(Float, nullable=True)
    tht_time_h = Column(Float, nullable=True)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    production = relationship("Production")

    def __repr__(self):
        return f"<ProductionCostInput production_id={self.production_id}>"


class ProductionCosting(Base):
    """Frozen costing snapshot for a (production, card). Latest per card = price reference."""

    __tablename__ = "PRODUCTION_COSTING"

    id = Column(Integer, primary_key=True, index=True)
    bom_reference_id = Column(
        Integer, ForeignKey("BOM_REFERENCES.id"), nullable=False, index=True
    )
    production_id = Column(Integer, ForeignKey("PRODUCTIONS.id"), nullable=True, index=True)
    quantity = Column(Integer, nullable=False, default=1)
    unit_cost_ht = Column(Float, nullable=False, default=0.0)
    unit_cost_ttc = Column(Float, nullable=False, default=0.0)
    total_ht = Column(Float, nullable=False, default=0.0)
    total_ttc = Column(Float, nullable=False, default=0.0)
    material_cost = Column(Float, nullable=False, default=0.0)   # matière / carte
    labor_cost = Column(Float, nullable=False, default=0.0)      # MO / carte
    nre_cost = Column(Float, nullable=False, default=0.0)        # frais fixes amortis / carte
    is_reference = Column(Boolean, nullable=False, default=True, server_default="1")
    computed_at = Column(DateTime, default=utcnow, index=True)
    params_snapshot = Column(Text, nullable=True)               # JSON: taux + inputs figés

    # Réservés pour extension — cf. ADR 0005.
    machine_cost = Column(Float, nullable=True)
    overhead_cost = Column(Float, nullable=True)
    margin_amount = Column(Float, nullable=True)
    sell_price = Column(Float, nullable=True)

    reference = relationship("BomReference")
    production = relationship("Production")

    def __repr__(self):
        return f"<ProductionCosting card={self.bom_reference_id} ht={self.unit_cost_ht}>"
