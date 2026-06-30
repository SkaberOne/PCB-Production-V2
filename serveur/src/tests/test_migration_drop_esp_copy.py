"""T-008 — la migration b2c4e6f8a0d1 supprime la règle résiduelle ESP-MODULE_COPY
sans toucher à ESP-MODULE, et reste idempotente si le doublon est absent.
"""
import importlib
import sys
from pathlib import Path

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, text

PROJECT_ROOT = Path(__file__).resolve().parents[3]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.models.bom import ComponentTypeRule  # noqa: E402

MIGRATION = importlib.import_module(
    "src.alembic.versions.b2c4e6f8a0d1_drop_esp_module_copy_rule"
)

_INSERT = (
    "INSERT INTO COMPONENT_TYPE_RULES "
    "(reference_prefix, mapped_type, requires_confirmation, priority, enabled) "
    "VALUES (:prefix, 'MODULE', 0, 10, 1)"
)


def _run_upgrade(connection):
    ctx = MigrationContext.configure(connection)
    with Operations.context(ctx):
        MIGRATION.upgrade()


def _fresh_engine():
    engine = create_engine("sqlite://")
    ComponentTypeRule.__table__.create(bind=engine)
    return engine


def test_migration_removes_only_the_copy_rule():
    engine = _fresh_engine()
    with engine.begin() as conn:
        conn.execute(text(_INSERT), {"prefix": "ESP-MODULE"})
        conn.execute(text(_INSERT), {"prefix": "ESP-MODULE_COPY"})
        _run_upgrade(conn)
    with engine.connect() as conn:
        rows = conn.execute(
            text("SELECT reference_prefix FROM COMPONENT_TYPE_RULES ORDER BY reference_prefix")
        ).scalars().all()
    assert rows == ["ESP-MODULE"]


def test_migration_is_idempotent_when_copy_absent():
    engine = _fresh_engine()
    with engine.begin() as conn:
        conn.execute(text(_INSERT), {"prefix": "ESP-MODULE"})
        _run_upgrade(conn)  # ne doit pas lever
    with engine.connect() as conn:
        count = conn.execute(text("SELECT COUNT(*) FROM COMPONENT_TYPE_RULES")).scalar()
    assert count == 1
