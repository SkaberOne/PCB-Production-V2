"""SQLAlchemy models for production workspaces linked to BOM revisions."""

import enum

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from ..database import Base, utcnow


class Production(Base):
    """A user-managed production workspace grouping several BOM revisions."""

    __tablename__ = "PRODUCTIONS"

    class StatusEnum(str, enum.Enum):
        DRAFT = "DRAFT"
        ACTIVE = "ACTIVE"
        COMPLETED = "COMPLETED"
        ARCHIVED = "ARCHIVED"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), unique=True, nullable=False, index=True)
    machine_id = Column(Integer, ForeignKey("PNP_MACHINES.id"), nullable=True, index=True)
    # Mode d'assemblage : PNP (machine), MANUEL (à la main), MIXTE. Les cartes
    # peuvent être assemblées sans machine — le workflow Machine PnP est alors
    # masqué côté UI. String simple (pas d'Enum SQL) pour rester additif.
    assembly_mode = Column(String(10), nullable=False, default="PNP", server_default="PNP")
    status = Column(Enum(StatusEnum), default=StatusEnum.ACTIVE)
    notes = Column(Text, nullable=True)
    erp_context = Column(JSON, nullable=True)
    manufacturing_order_validated_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)
    # Concurrence optimiste (ADR 0013 extension B) : incrémentée à chaque écriture,
    # vérifiée côté route seulement si le client envoie une version (opt-in).
    version = Column(Integer, nullable=False, default=1, server_default="1")

    bom_links = relationship(
        "ProductionBomRevision",
        back_populates="production",
        cascade="all, delete-orphan",
        order_by="ProductionBomRevision.added_at",
    )
    commands = relationship("Command", back_populates="production")
    machine = relationship("PnpMachine", back_populates="productions")

    def __repr__(self):
        return f"<Production {self.name}>"


class ProductionBomRevision(Base):
    """Association between a production workspace and a stored BOM revision."""

    __tablename__ = "PRODUCTION_BOM_REVISIONS"
    __table_args__ = (
        UniqueConstraint("production_id", "bom_revision_id", name="uq_production_bom_revision"),
    )

    id = Column(Integer, primary_key=True, index=True)
    production_id = Column(Integer, ForeignKey("PRODUCTIONS.id"), nullable=False)
    bom_revision_id = Column(Integer, ForeignKey("BOM_REVISIONS.id"), nullable=False)
    sequence_order = Column(Integer, nullable=True)
    quantity_to_produce = Column(Integer, nullable=True, default=1)
    added_at = Column(DateTime, default=utcnow)

    production = relationship("Production", back_populates="bom_links")
    revision = relationship("BomRevision")

    def __repr__(self):
        return f"<ProductionBomRevision production={self.production_id} bom={self.bom_revision_id}>"


class ProductionRun(Base):
    """A production batch (clôture) that consumed stock — see ADR 0011.

    Several runs per production are allowed (batches); each posts its own OUT
    movements (source_type='production', production_run_id=this.id) which add up.
    Cancelling a run reverses its OUT (never deletes). No DB FK from
    STOCK_MOVEMENTS.production_run_id (kept SQLite-friendly): the link is
    application-level.
    """

    __tablename__ = "PRODUCTION_RUNS"

    id = Column(Integer, primary_key=True, index=True)
    production_id = Column(Integer, ForeignKey("PRODUCTIONS.id"), nullable=False, index=True)
    machine_id = Column(Integer, ForeignKey("PNP_MACHINES.id"), nullable=True, index=True)
    boards_produced = Column(Integer, nullable=False, default=0, server_default="0")
    note = Column(Text, nullable=True)
    is_cancelled = Column(Boolean, nullable=False, default=False, server_default="0")
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    production = relationship("Production")
    machine = relationship("PnpMachine")

    def __repr__(self):
        return f"<ProductionRun prod={self.production_id} boards={self.boards_produced}>"
