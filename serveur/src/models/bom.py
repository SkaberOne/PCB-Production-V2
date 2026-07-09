"""SQLAlchemy models for BOM, component, and footprint data."""

import enum

from sqlalchemy import Boolean, Column, DateTime, Enum, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from ..database import Base, utcnow


class BomReference(Base):
    """Produced PCB reference."""

    __tablename__ = "BOM_REFERENCES"

    id = Column(Integer, primary_key=True, index=True)
    reference = Column(String(100), unique=True, nullable=False, index=True)
    category = Column(String(100), nullable=True, index=True)
    description = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    revisions = relationship("BomRevision", back_populates="reference", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<BomReference {self.reference}>"


class BomCategory(Base):
    """Manual category catalog used to group PCB references."""

    __tablename__ = "BOM_CATEGORIES"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False, index=True)
    description = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    def __repr__(self):
        return f"<BomCategory {self.name}>"


class BomRevision(Base):
    """BOM revision such as REV_A / REV_B."""

    __tablename__ = "BOM_REVISIONS"

    class TypeEnum(str, enum.Enum):
        TOP = "TOP"
        BOT = "BOT"

    class StatusEnum(str, enum.Enum):
        DRAFT = "DRAFT"
        ACTIVE = "ACTIVE"
        ARCHIVED = "ARCHIVED"

    id = Column(Integer, primary_key=True, index=True)
    bom_ref_id = Column(Integer, ForeignKey("BOM_REFERENCES.id"), nullable=False)
    revision = Column(String(20), nullable=False)
    type = Column(Enum(TypeEnum), nullable=False)
    created_at = Column(DateTime, default=utcnow)
    status = Column(Enum(StatusEnum), default=StatusEnum.DRAFT)

    reference = relationship("BomReference", back_populates="revisions")
    items = relationship("BomItem", back_populates="revision", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<BomRevision {self.revision} {self.type}>"


class BomItem(Base):
    """Individual component line from a BOM."""

    __tablename__ = "BOM_ITEMS"

    id = Column(Integer, primary_key=True, index=True)
    bom_revision_id = Column(Integer, ForeignKey("BOM_REVISIONS.id"), nullable=False)
    reference_item = Column(String(50), nullable=False)
    value_raw = Column(String(100), nullable=True)
    value_harmonized = Column(String(100), nullable=True)
    footprint_eagle = Column(String(100), nullable=True)
    footprint_pnp = Column(String(100), nullable=True)
    x = Column(Float, nullable=True)
    y = Column(Float, nullable=True)
    rotation = Column(Integer, nullable=True)
    placement_side = Column(String(10), nullable=True)
    component_type = Column(String(20), nullable=True)
    quantity = Column(Integer, nullable=False, default=1, server_default="1")
    dnp = Column(Boolean, nullable=False, default=False, server_default="0")
    notes = Column(Text, nullable=True)

    revision = relationship("BomRevision", back_populates="items")

    def __repr__(self):
        return f"<BomItem {self.reference_item} {self.value_harmonized}>"


class Component(Base):
    """Component master data / library."""

    __tablename__ = "COMPONENTS"

    id = Column(Integer, primary_key=True, index=True)
    reference = Column(String(100), unique=True, nullable=False, index=True)
    value = Column(String(100), nullable=True)
    mpn = Column(String(200), nullable=True, index=True)
    component_type = Column(String(50), nullable=True, index=True)
    package = Column(String(50), nullable=True)
    tape_width_mm = Column(Float, nullable=True)
    pitch_mm = Column(Float, nullable=True)
    qty_per_reel = Column(Integer, nullable=True)
    reel_outer_diameter_mm = Column(Float, nullable=True)
    reel_hub_diameter_mm = Column(Float, nullable=True)
    supplier_code = Column(String(100), nullable=True)
    footprint_eagle = Column(String(100), nullable=True, index=True)
    footprint_pnp = Column(String(100), nullable=True, index=True)
    feeder_type = Column(String(50), nullable=True)
    is_fixed_feeder = Column(Boolean, default=False, nullable=True)
    fixed_cart_id = Column(Integer, ForeignKey("PNP_CARTS.id"), nullable=True, index=True)
    description = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    # Concurrence optimiste (ADR 0013, phase 2) : incrémenté à chaque écriture.
    # Le client renvoie la version lue ; si elle diffère à l'écriture -> HTTP 409.
    version = Column(Integer, nullable=False, default=1, server_default="1")
    # Cycle de vie (ADR 0014) : enum normalisé agrégé pire-cas des offres fournisseurs
    # (ACTIVE / NRND / EOL / UNKNOWN) + date de dernière vérification.
    lifecycle_status = Column(String(16), nullable=False, default="UNKNOWN", server_default="UNKNOWN")
    lifecycle_checked_at = Column(DateTime, nullable=True)

    fixed_cart = relationship("PnpCart", back_populates="components")

    def __repr__(self):
        return f"<Component {self.reference}>"


class MachineFootprintCatalog(Base):
    """Reference catalog for machine footprints and feeder metadata."""

    __tablename__ = "MACHINE_FOOTPRINT_CATALOG"

    id = Column(Integer, primary_key=True, index=True)
    component_type = Column(String(50), nullable=True, index=True)
    machine_footprint = Column(String(100), unique=True, nullable=False, index=True)
    tape_width_mm = Column(Float, nullable=True)
    pitch_mm = Column(Float, nullable=True)
    feeder_type = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    def __repr__(self):
        return f"<MachineFootprintCatalog {self.machine_footprint}>"


class MachineFootprintRule(Base):
    """Raw machine-footprint rules imported from the external reference table."""

    __tablename__ = "MACHINE_FOOTPRINT_RULES"

    id = Column(Integer, primary_key=True, index=True)
    component_type = Column(String(50), nullable=True, index=True)
    machine_footprint = Column(String(100), nullable=False, index=True)
    tape_width_mm = Column(Float, nullable=True)
    pitch_mm = Column(Float, nullable=True)
    feeder_type = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    def __repr__(self):
        return (
            f"<MachineFootprintRule {self.machine_footprint} "
            f"type={self.component_type} tape={self.tape_width_mm} pitch={self.pitch_mm}>"
        )


class ComponentTypeRule(Base):
    """Reference-prefix rules used to infer business component families."""

    __tablename__ = "COMPONENT_TYPE_RULES"

    id = Column(Integer, primary_key=True, index=True)
    reference_prefix = Column(String(50), unique=True, nullable=False, index=True)
    mapped_type = Column(String(50), nullable=True)
    requires_confirmation = Column(Boolean, default=False, nullable=False)
    priority = Column(Integer, default=100, nullable=False)
    enabled = Column(Boolean, default=True, nullable=False)
    description = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    def __repr__(self):
        return (
            f"<ComponentTypeRule prefix={self.reference_prefix} "
            f"type={self.mapped_type} priority={self.priority}>"
        )


class FootprintMapping(Base):
    """Reusable Eagle footprint -> PnP footprint mapping."""

    __tablename__ = "FOOTPRINT_MAPPING"

    id = Column(Integer, primary_key=True, index=True)
    footprint_eagle = Column(String(100), nullable=False, index=True)
    footprint_pnp = Column(String(100), nullable=False)
    machine_compatible = Column(String(50), nullable=True)
    notes = Column(Text, nullable=True)

    def __repr__(self):
        return f"<FootprintMapping {self.footprint_eagle} -> {self.footprint_pnp}>"
