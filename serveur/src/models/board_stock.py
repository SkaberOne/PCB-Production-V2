"""Modèles : stock de cartes finies + commandes client/machine (ADR 0017).

- ``BoardStock`` : stock de cartes produites, une ligne par référence de carte
  (``BOM_REFERENCES``). Porte la quantité, le seuil minimum, un prix par carte
  surchargeable (sinon prix Costing), et l'état QA du stock (testées/validées/
  à débugger).
- ``ClientOrder`` / ``ClientOrderLine`` : demandes de cartes pour un client
  externe ou un besoin machine/interne, avec préparation de « boîte ».
"""

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship

from ..database import Base, utcnow


class BoardStock(Base):
    """Stock de cartes finies, indexé par référence de carte (unique)."""

    __tablename__ = "BOARD_STOCK"
    __table_args__ = (
        UniqueConstraint("bom_reference_id", name="uq_board_stock_reference"),
    )

    id = Column(Integer, primary_key=True, index=True)
    bom_reference_id = Column(Integer, ForeignKey("BOM_REFERENCES.id"), nullable=False, index=True)

    qty_in_stock = Column(Integer, nullable=False, default=0, server_default="0")
    min_stock = Column(Integer, nullable=False, default=0, server_default="0")
    # Prix par carte saisi à la main ; None => prix de référence Costing.
    unit_price_override = Column(Float, nullable=True)

    # État QA du stock de cartes (éditable). Distinct du suivi par production.
    cards_tested = Column(Integer, nullable=False, default=0, server_default="0")
    cards_validated = Column(Integer, nullable=False, default=0, server_default="0")
    cards_to_debug = Column(Integer, nullable=False, default=0, server_default="0")

    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    reference = relationship("BomReference")

    def __repr__(self):
        return f"<BoardStock ref={self.bom_reference_id} qty={self.qty_in_stock}>"


class Client(Base):
    """Client de l'entreprise, auquel on affecte des commandes / machines."""

    __tablename__ = "CLIENTS"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), unique=True, nullable=False, index=True)
    contact = Column(String(300), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    orders = relationship("ClientOrder", back_populates="client")

    def __repr__(self):
        return f"<Client {self.name}>"


class MachineModel(Base):
    """Modèle de machine réutilisable = un nom + une liste de cartes prédéfinie."""

    __tablename__ = "MACHINE_MODELS"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), unique=True, nullable=False, index=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    cards = relationship(
        "MachineModelCard",
        back_populates="model",
        cascade="all, delete-orphan",
    )

    def __repr__(self):
        return f"<MachineModel {self.name}>"


class MachineModelCard(Base):
    """Une carte (référence + quantité) composant un modèle de machine."""

    __tablename__ = "MACHINE_MODEL_CARDS"

    id = Column(Integer, primary_key=True, index=True)
    machine_model_id = Column(Integer, ForeignKey("MACHINE_MODELS.id"), nullable=False, index=True)
    bom_reference_id = Column(Integer, ForeignKey("BOM_REFERENCES.id"), nullable=False, index=True)
    quantity = Column(Integer, nullable=False, default=1, server_default="1")

    model = relationship("MachineModel", back_populates="cards")
    reference = relationship("BomReference")


class ClientOrder(Base):
    """Commande d'un client : soit une commande de cartes (CLIENT), soit une
    machine commandée (MACHINE, = cartes d'un modèle × machine_count)."""

    __tablename__ = "CLIENT_ORDERS"

    id = Column(Integer, primary_key=True, index=True)
    reference = Column(String(40), unique=True, nullable=False, index=True)
    order_type = Column(String(10), nullable=False, default="CLIENT", server_default="CLIENT")  # CLIENT | MACHINE
    client_id = Column(Integer, ForeignKey("CLIENTS.id"), nullable=True)
    machine_model_id = Column(Integer, ForeignKey("MACHINE_MODELS.id"), nullable=True)
    machine_count = Column(Integer, nullable=True)  # nb de machines (order_type MACHINE)
    recipient = Column(String(200), nullable=True)  # libellé libre (repli / besoin interne)
    status = Column(String(12), nullable=False, default="OPEN", server_default="OPEN")  # OPEN|READY|DELIVERED|CANCELLED
    due_date = Column(DateTime, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    lines = relationship(
        "ClientOrderLine",
        back_populates="order",
        cascade="all, delete-orphan",
    )
    client = relationship("Client", back_populates="orders")
    machine_model = relationship("MachineModel")

    def __repr__(self):
        return f"<ClientOrder {self.reference} {self.status}>"


class ClientOrderLine(Base):
    """Ligne d'une commande : une référence de carte + quantité demandée/préparée."""

    __tablename__ = "CLIENT_ORDER_LINES"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("CLIENT_ORDERS.id"), nullable=False, index=True)
    bom_reference_id = Column(Integer, ForeignKey("BOM_REFERENCES.id"), nullable=False, index=True)

    quantity = Column(Integer, nullable=False, default=1, server_default="1")
    quantity_prepared = Column(Integer, nullable=False, default=0, server_default="0")
    notes = Column(Text, nullable=True)

    order = relationship("ClientOrder", back_populates="lines")
    reference = relationship("BomReference")

    def __repr__(self):
        return f"<ClientOrderLine order={self.order_id} ref={self.bom_reference_id} q={self.quantity}>"
