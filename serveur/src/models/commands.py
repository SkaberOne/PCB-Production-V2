"""SQLAlchemy models for commands and production plans."""

import enum

from sqlalchemy import (
    Column,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from ..database import Base, utcnow


class Command(Base):
    """Production command/list"""
    __tablename__ = "COMMANDS"

    class StatusEnum(str, enum.Enum):
        DRAFT = "DRAFT"
        READY = "READY"
        SENT = "SENT"
        RECEIVED = "RECEIVED"
        ARCHIVED = "ARCHIVED"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    production_id = Column(Integer, ForeignKey("PRODUCTIONS.id"), nullable=True, index=True)
    status = Column(Enum(StatusEnum), default=StatusEnum.DRAFT)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)
    notes = Column(Text, nullable=True)

    # Relationships
    production = relationship("Production", back_populates="commands")
    items = relationship("CommandItem", back_populates="command", cascade="all, delete-orphan")
    production_plans = relationship("ProductionPlan", back_populates="command", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Command {self.name}>"

class CommandItem(Base):
    """Item in a production command (associates BOM to command with quantity)"""
    __tablename__ = "COMMAND_ITEMS"

    id = Column(Integer, primary_key=True, index=True)
    command_id = Column(Integer, ForeignKey("COMMANDS.id"), nullable=False)
    bom_revision_id = Column(Integer, ForeignKey("BOM_REVISIONS.id"), nullable=False)
    quantity_to_produce = Column(Integer, default=1)

    # Relationships
    command = relationship("Command", back_populates="items")

    def __repr__(self):
        return f"<CommandItem {self.command_id} - BOM {self.bom_revision_id}>"

class ProductionPlan(Base):
    """Production plan for a command on a specific machine"""
    __tablename__ = "PRODUCTION_PLANS"

    id = Column(Integer, primary_key=True, index=True)
    command_id = Column(Integer, ForeignKey("COMMANDS.id"), nullable=False)
    machine_id = Column(Integer, ForeignKey("PNP_MACHINES.id"), nullable=False)
    created_at = Column(DateTime, default=utcnow)
    notes = Column(Text, nullable=True)

    # Relationships
    command = relationship("Command", back_populates="production_plans")
    machine = relationship("PnpMachine", back_populates="production_plans")
    assignments = relationship("PlanAssignment", back_populates="plan", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<ProductionPlan {self.command_id} on Machine {self.machine_id}>"

class ErpDefaults(Base):
    """Single-row table holding the default values prefilled in the ERP export.

    Editable from the admin screen. Seeded from settings on first read.
    See ADR 0004 / audit 2026-06-03 6.2.
    """

    __tablename__ = "ERP_DEFAULTS"

    id = Column(Integer, primary_key=True, index=True)
    project = Column(String(250), nullable=True)
    unit = Column(String(50), nullable=True)
    requester = Column(String(150), nullable=True)
    validator = Column(String(150), nullable=True)
    delay = Column(String(100), nullable=True)
    remark = Column(String(500), nullable=True)
    default_supplier = Column(String(50), nullable=True)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    def __repr__(self):
        return f"<ErpDefaults project={self.project!r}>"


class SupplierOffer(Base):
    """Cached price/availability offer for a component at a given supplier.

    One row per (component, supplier). Filled/refreshed from the supplier APIs
    (Mouser, DigiKey, ...). fetched_at drives cache freshness (TTL).
    See ADR 0004 and docs/audits/Audit_2026-06-03_integration_api_fournisseurs.md.
    """

    __tablename__ = "SUPPLIER_OFFERS"

    id = Column(Integer, primary_key=True, index=True)
    component_id = Column(Integer, ForeignKey("COMPONENTS.id"), nullable=False, index=True)
    supplier = Column(String(20), nullable=False, index=True)  # MOUSER | DIGIKEY | FARNELL | RS
    supplier_part = Column(String(120), nullable=True)
    mpn = Column(String(200), nullable=True)
    manufacturer = Column(String(120), nullable=True)
    product_url = Column(Text, nullable=True)
    datasheet_url = Column(Text, nullable=True)
    currency = Column(String(8), nullable=True)
    unit_price = Column(Float, nullable=True)
    stock_qty = Column(Integer, nullable=True)
    lead_time_days = Column(Integer, nullable=True)
    price_breaks = Column(Text, nullable=True)  # JSON [{"qty": int, "price": float}]
    raw_payload = Column(Text, nullable=True)
    fetched_at = Column(DateTime, default=utcnow, index=True)

    component = relationship("Component")

    def __repr__(self):
        return f"<SupplierOffer {self.supplier} comp={self.component_id} {self.unit_price}{self.currency}>"


class CommandReceipt(Base):
    """Quantity received for a command line (aggregate key), for receiving tracking.

    Keyed by the aggregated line key (value__footprint__type) so it survives
    re-aggregation. A line turns green in the UI when qty_received >= qty to order.
    """

    __tablename__ = "COMMAND_RECEIPTS"

    id = Column(Integer, primary_key=True, index=True)
    command_id = Column(Integer, ForeignKey("COMMANDS.id"), nullable=False, index=True)
    line_key = Column(String(300), nullable=False)
    qty_received = Column(Integer, default=0, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    def __repr__(self):
        return f"<CommandReceipt cmd={self.command_id} {self.line_key} recu={self.qty_received}>"


class CommandLineDetail(Base):
    """Manual per-line completion for a command (aggregate key).

    Lets an operator complete/override a command line from the Commande page popup:
    a quantity-to-order override, a free note, and a manual supplier offer
    (supplier/price/URL) for parts the supplier APIs don't cover. ``manual_mpn`` is
    only used as a fallback when the line has no library component to write the MPN
    onto; when ``component_library_id`` exists the MPN is written directly on
    COMPONENTS (library-wide). Keyed by the aggregated line key so it survives
    re-aggregation, exactly like COMMAND_RECEIPTS.
    """

    __tablename__ = "COMMAND_LINE_DETAILS"
    __table_args__ = (
        UniqueConstraint("command_id", "line_key", name="uq_command_line_detail"),
    )

    id = Column(Integer, primary_key=True, index=True)
    command_id = Column(Integer, ForeignKey("COMMANDS.id"), nullable=False, index=True)
    line_key = Column(String(300), nullable=False)

    quantity_to_order = Column(Integer, nullable=True)  # None => quantité calculée
    note = Column(Text, nullable=True)

    manual_mpn = Column(String(200), nullable=True)  # fallback si pas de composant biblio
    manual_supplier = Column(String(80), nullable=True)
    manual_supplier_part = Column(String(200), nullable=True)
    manual_unit_price = Column(Float, nullable=True)
    manual_currency = Column(String(8), nullable=True)
    manual_product_url = Column(Text, nullable=True)

    # Fournisseur retenu PARMI les offres API (choix par composant sur la page
    # Commande). Contrairement à manual_supplier (offre saisie à la main, prix
    # figé), ici on ne stocke que le CODE fournisseur : le prix reste « live »
    # (recalculé depuis SUPPLIER_OFFERS à chaque affichage/export).
    selected_supplier = Column(String(20), nullable=True)

    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    def __repr__(self):
        return f"<CommandLineDetail cmd={self.command_id} {self.line_key}>"


class PlanAssignment(Base):
    """Assignment of component to feeder position in production plan"""
    __tablename__ = "PLAN_ASSIGNMENTS"

    id = Column(Integer, primary_key=True, index=True)
    production_plan_id = Column(Integer, ForeignKey("PRODUCTION_PLANS.id"), nullable=False)
    feeder_position = Column(Integer, nullable=False)  # 1-60 on machine
    component_id = Column(Integer, ForeignKey("COMPONENTS.id"), nullable=False)
    quantity = Column(Integer, default=1)

    # Relationships
    plan = relationship("ProductionPlan", back_populates="assignments")

    def __repr__(self):
        return f"<PlanAssignment Position {self.feeder_position}>"
