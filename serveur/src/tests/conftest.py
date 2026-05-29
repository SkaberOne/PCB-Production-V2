"""
Shared test setup: SQLite engine, TestClient, cleanup fixture.
"""
import os
import sys

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

# Import models first to register them in Base
from src.backend.database import Base
from src.backend.models.bom import (
    BomReference, BomRevision, BomItem, Component,
    ComponentTypeRule, FootprintMapping, MachineFootprintRule,
)
from src.backend.models.commands import Command, CommandItem, ProductionPlan, PlanAssignment
from src.backend.models.machines import PnpCart, PnpFeeder, PnpMachine
from src.backend.models.production import Production, ProductionBomRevision

SQLALCHEMY_TEST_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    SQLALCHEMY_TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base.metadata.create_all(bind=engine)

from src.backend.app import app
from src.backend.database import get_db as db_get_db
from src.backend.routes.bom import bom_file_service, get_db as bom_get_db


def override_get_db():
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()


app.dependency_overrides[bom_get_db] = override_get_db
app.dependency_overrides[db_get_db] = override_get_db

client = TestClient(app)


@pytest.fixture(scope="function", autouse=True)
def cleanup_db():
    """Reset the database before and after each test."""
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
