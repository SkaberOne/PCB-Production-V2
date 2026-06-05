"""SQLAlchemy models for PnP machines, feeders, and logical carts."""

import enum

from sqlalchemy import Column, DateTime, Enum, ForeignKey, Integer, String, Table, Text
from sqlalchemy.orm import relationship

from ..database import Base, utcnow

# Association table for many-to-many relationship between machines and feeders
machine_feeder_association = Table(
    'PNP_MACHINE_FEEDERS',
    Base.metadata,
    Column('machine_id', Integer, ForeignKey('PNP_MACHINES.id'), primary_key=True),
    Column('feeder_id', Integer, ForeignKey('PNP_FEEDERS.id'), primary_key=True)
)

class PnpMachine(Base):
    """PnP Machine"""
    __tablename__ = "PNP_MACHINES"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False, index=True)
    num_positions = Column(Integer, nullable=False)  # 60, 80, etc
    num_nozzles = Column(Integer, nullable=True)  # nb de nozzles sur la tête (None = non configuré)
    description = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utcnow)
    
    # Relationships
    feeders = relationship(
        "PnpFeeder",
        secondary=machine_feeder_association,
        back_populates="machines"
    )
    production_plans = relationship(
        "ProductionPlan",
        back_populates="machine",
        cascade="all, delete-orphan",
    )
    productions = relationship("Production", back_populates="machine")
    
    def __repr__(self):
        return f"<PnpMachine {self.name}>"


class PnpFeeder(Base):
    """Feeder type/size"""
    __tablename__ = "PNP_FEEDERS"
    
    id = Column(Integer, primary_key=True, index=True)
    size_mm = Column(Integer, nullable=False, unique=True)  # 8, 12, 16
    capacity = Column(Integer, nullable=True)  # Max components per feeder
    description = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    
    # Relationships
    machines = relationship(
        "PnpMachine",
        secondary=machine_feeder_association,
        back_populates="feeders"
    )
    
    def __repr__(self):
        return f"<PnpFeeder {self.size_mm}mm>"


class PnpCart(Base):
    """Logical feeder cart used to group fixed components."""

    __tablename__ = "PNP_CARTS"

    class KindEnum(str, enum.Enum):
        COMMON = "COMMON"
        CATEGORY = "CATEGORY"
        CUSTOM = "CUSTOM"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False, index=True)
    kind = Column(Enum(KindEnum), nullable=False, default=KindEnum.CUSTOM)
    target_category = Column(String(100), nullable=True, index=True)
    capacity_positions = Column(Integer, nullable=False, default=80)
    description = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    components = relationship("Component", back_populates="fixed_cart")

    def __repr__(self):
        return f"<PnpCart {self.name}>"
