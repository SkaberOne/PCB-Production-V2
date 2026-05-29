"""SQLAlchemy models for commands and production plans."""

import enum

from sqlalchemy import Column, DateTime, Enum, ForeignKey, Integer, String, Text
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
