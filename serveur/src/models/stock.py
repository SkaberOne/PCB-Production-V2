"""SQLAlchemy models for the internal physical component stock (4th stock notion).

See docs/adr/0010-inventaire-stock-composants.md.

- ``ComponentStock``  : per-component cached balance + last-declared breakdown.
- ``StockMovement``   : append-only signed journal (source of truth for the balance).
- ``StockSettings``   : single-row global settings (loss coefficient).

No ``user`` column: single-user app, no auth model (``auth.py`` = optional API key).
Timestamps use ``utcnow()`` from ``database.py`` (timezone-aware, ``datetime.utcnow``
is deprecated).
"""

import enum

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import relationship

from ..database import Base, utcnow


class StockSens(str, enum.Enum):
    """Direction of a movement. Signed effect = +qty (IN) / -qty (OUT)."""

    IN = "IN"
    OUT = "OUT"


class StockMotif(str, enum.Enum):
    """Business reason for a movement. Member names == values (stored lowercase)."""

    declaration = "declaration"  # manual physical recount from BomStockDialog (set-to)
    reception = "reception"      # auto IN from a CommandReceipt
    production = "production"     # auto OUT at production close (Phase 2)
    correction = "correction"    # periodic inventory recount (set-to); absorbs SAV drain


class StockConditionnement(str, enum.Enum):
    """Physical packaging form. Member names == values (stored lowercase)."""

    reel = "reel"
    bag = "bag"
    tube = "tube"


class ComponentStock(Base):
    """Cached physical stock per component (derivable from the movement journal)."""

    __tablename__ = "COMPONENT_STOCK"

    id = Column(Integer, primary_key=True, index=True)
    component_id = Column(
        Integer, ForeignKey("COMPONENTS.id"), nullable=False, unique=True, index=True
    )
    # Cached total balance = Σ signed(qty) over the journal (recomputable).
    qty_pieces = Column(Integer, nullable=False, default=0, server_default="0")
    # Last-declared physical breakdown (piece counts per form). Snapshot only:
    # may differ from qty_pieces which also includes receptions/production.
    qty_reel = Column(Integer, nullable=False, default=0, server_default="0")
    qty_bag = Column(Integer, nullable=False, default=0, server_default="0")
    qty_tube = Column(Integer, nullable=False, default=0, server_default="0")
    # "Low" threshold per component (default 0 = no threshold).
    safety_stock = Column(Integer, nullable=False, default=0, server_default="0")
    # Per-component override of the global production loss coefficient (null => global).
    loss_pct = Column(Float, nullable=True)
    # Vérification physique (ADR 0013, phase 1 — version A) : marque que la quantité
    # stock a été confirmée sur le terrain. N'affecte PAS le solde (annotation légère).
    # verified_qty = solde au moment de la validation (trace de la valeur confirmée).
    verified_at = Column(DateTime, nullable=True)
    verified_qty = Column(Integer, nullable=True)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    component = relationship("Component")

    def __repr__(self):
        return f"<ComponentStock comp={self.component_id} qty={self.qty_pieces}>"


class StockMovement(Base):
    """Append-only signed stock journal (source of truth of the balance).

    Idempotence + reversibility (ADR 0010 §4): a filtered UNIQUE index on
    ``(source_type, source_id) WHERE is_reversed = 0`` guarantees at most ONE
    *active* movement per source event. Cancelling/superseding an event marks the
    active row ``is_reversed = True`` and appends an inverse row (never deletes).
    The ``is_reversed`` flag only governs active-uniqueness; it does NOT exclude a
    row from the balance sum (the inverse row nets the original out).
    """

    __tablename__ = "STOCK_MOVEMENTS"

    id = Column(Integer, primary_key=True, index=True)
    component_id = Column(Integer, ForeignKey("COMPONENTS.id"), nullable=False, index=True)
    sens = Column(Enum(StockSens), nullable=False)
    qty = Column(Integer, nullable=False)  # magnitude >= 0
    motif = Column(Enum(StockMotif), nullable=False)
    conditionnement = Column(Enum(StockConditionnement), nullable=True)
    source_type = Column(String(40), nullable=False)
    source_id = Column(String(80), nullable=True)
    # Reserved for Phase 2 (production close). No FK yet: ProductionRun does not exist.
    production_run_id = Column(Integer, nullable=True, index=True)
    date = Column(DateTime, nullable=False, default=utcnow, index=True)
    note = Column(Text, nullable=True)
    is_reversed = Column(Boolean, nullable=False, default=False, server_default="0")
    reverses_id = Column(Integer, ForeignKey("STOCK_MOVEMENTS.id"), nullable=True)

    component = relationship("Component")

    __table_args__ = (
        # Filtered unique index — supported by both SQLite and SQL Server.
        Index(
            "uq_stock_movement_active_source",
            "source_type",
            "source_id",
            unique=True,
            sqlite_where=text("is_reversed = 0"),
            mssql_where=text("is_reversed = 0"),
        ),
    )

    @property
    def signed_qty(self) -> int:
        return self.qty if self.sens == StockSens.IN else -self.qty

    def __repr__(self):
        return (
            f"<StockMovement comp={self.component_id} {self.sens.value} "
            f"{self.qty} {self.motif.value}>"
        )


class ComponentMachineLoad(Base):
    """Component quantity physically loaded on a machine's feeders (ADR 0012).

    Annotation (current state, set-to upsert) — does NOT affect the stock balance
    (qty_pieces). engaged(component) = Σ qty_loaded over machines ;
    free = solde − engaged. Manual load/unload from Machine PnP.
    """

    __tablename__ = "COMPONENT_MACHINE_LOADS"
    __table_args__ = (
        UniqueConstraint("machine_id", "component_id", name="uq_component_machine_load"),
    )

    id = Column(Integer, primary_key=True, index=True)
    machine_id = Column(Integer, ForeignKey("PNP_MACHINES.id"), nullable=False, index=True)
    component_id = Column(Integer, ForeignKey("COMPONENTS.id"), nullable=False, index=True)
    qty_loaded = Column(Integer, nullable=False, default=0, server_default="0")
    note = Column(Text, nullable=True)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    component = relationship("Component")
    machine = relationship("PnpMachine")

    def __repr__(self):
        return f"<ComponentMachineLoad m={self.machine_id} c={self.component_id} qty={self.qty_loaded}>"


class StockSettings(Base):
    """Single-row global stock settings (motif ErpDefaults)."""

    __tablename__ = "STOCK_SETTINGS"

    id = Column(Integer, primary_key=True, index=True)
    # Global production loss coefficient in percent (default 0.0 = neutral).
    global_loss_pct = Column(Float, nullable=False, default=0.0, server_default="0")
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    def __repr__(self):
        return f"<StockSettings loss={self.global_loss_pct}>"
