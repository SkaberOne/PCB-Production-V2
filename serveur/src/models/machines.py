"""SQLAlchemy models for PnP machines, feeders, and logical carts."""

import enum

from sqlalchemy import Column, DateTime, Enum, ForeignKey, Integer, String, Table, Text, UniqueConstraint
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
    nozzle_layout = Column(Text, nullable=True)  # JSON: type de nozzle (501..505) par position
    # Configuration d'export PnP (fichier envoyé au logiciel Pick&Place).
    # export_format   : 'CSV' (colonnes personnalisées) ou 'TXT' (BOM empreintes harmonisées)
    # export_columns  : JSON liste d'ids de colonnes (ordre = ordre d'export) pour le CSV
    # export_separator: ',' ou ';' pour le CSV
    export_format = Column(String(10), nullable=True)
    export_columns = Column(Text, nullable=True)
    export_separator = Column(String(4), nullable=True)
    # Numérotation physique du rail ARRIÈRE pour la colonne « Feeder » de l'export.
    # 'ASC'  : continue (ex. 80 positions → arrière 41→80, gauche→droite) — défaut,
    #          correspond aux positions linéaires internes (machine A).
    # 'DESC' : inversée (ex. arrière 80→41, gauche→droite) — machine B.
    # L'avant reste toujours 1→front_cols. None ⇒ traité comme 'ASC'.
    feeder_back_order = Column(String(4), nullable=True)
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


class PnpSlotPin(Base):
    """Épinglage manuel d'un composant à un slot précis pour une production donnée.

    Portée GLOBALE (par machine + production, toutes faces). Le moteur de placement
    pose ces composants à leur slot avant le remplissage automatique. Les conflits
    (slot pris, chevauchement gros feeder, nozzle incompatible) sont refusés au moment
    de la création (validation côté service).
    """

    __tablename__ = "PNP_SLOT_PINS"

    id = Column(Integer, primary_key=True, index=True)
    machine_id = Column(Integer, ForeignKey("PNP_MACHINES.id"), nullable=False, index=True)
    production_id = Column(Integer, ForeignKey("PRODUCTIONS.id"), nullable=False, index=True)
    component_id = Column(Integer, ForeignKey("COMPONENTS.id"), nullable=False, index=True)
    slot_position = Column(Integer, nullable=False)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    __table_args__ = (
        UniqueConstraint("machine_id", "production_id", "component_id", name="uq_slot_pin_component"),
    )

    def __repr__(self):
        return f"<PnpSlotPin m{self.machine_id} p{self.production_id} c{self.component_id} -> slot {self.slot_position}>"


class PnpManualPlacement(Base):
    """Composant forcé en « pose à la main » pour une production donnée (global,
    toutes faces). Présent ⇒ le composant est exclu du placement PnP et listé dans
    « à placer à la main », quel que soit l'état de la capacité.
    """

    __tablename__ = "PNP_MANUAL_PLACEMENTS"

    id = Column(Integer, primary_key=True, index=True)
    machine_id = Column(Integer, ForeignKey("PNP_MACHINES.id"), nullable=False, index=True)
    production_id = Column(Integer, ForeignKey("PRODUCTIONS.id"), nullable=False, index=True)
    component_id = Column(Integer, ForeignKey("COMPONENTS.id"), nullable=False, index=True)
    created_at = Column(DateTime, default=utcnow)

    __table_args__ = (
        UniqueConstraint("machine_id", "production_id", "component_id", name="uq_manual_placement_component"),
    )

    def __repr__(self):
        return f"<PnpManualPlacement m{self.machine_id} p{self.production_id} c{self.component_id}>"


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
