"""SQLAlchemy database configuration."""

import logging
from datetime import datetime, timezone

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import declarative_base, sessionmaker

from .config import settings


def utcnow() -> datetime:
    """Return current UTC time (timezone-aware). Use instead of datetime.utcnow()."""
    return datetime.now(timezone.utc)


logger = logging.getLogger(__name__)


engine = create_engine(
    settings.database_url,
    echo=False,
    connect_args={"check_same_thread": False} if "sqlite" in settings.database_url else {},
    pool_pre_ping=True,
    pool_recycle=3600,
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)

Base = declarative_base()


def ensure_sqlite_schema() -> None:
    """Create missing SQLite tables and append newly added nullable columns.

    This keeps the local dev database usable across additive schema changes
    without requiring a manual migration step for every test session.
    """
    if "sqlite" not in settings.database_url:
        return

    Base.metadata.create_all(bind=engine)

    inspector = inspect(engine)
    with engine.begin() as connection:
        for table in Base.metadata.sorted_tables:
            existing_tables = set(inspector.get_table_names())
            if table.name not in existing_tables:
                continue

            existing_columns = {
                column_info["name"]
                for column_info in inspector.get_columns(table.name)
            }

            for column in table.columns:
                if column.name in existing_columns:
                    continue

                if column.primary_key:
                    logger.warning(
                        "Skipping SQLite auto-sync for primary key column %s.%s",
                        table.name,
                        column.name,
                    )
                    continue

                if not column.nullable and column.server_default is None and column.default is None:
                    logger.warning(
                        "Skipping SQLite auto-sync for non-nullable column without default %s.%s",
                        table.name,
                        column.name,
                    )
                    continue

                column_type = column.type.compile(dialect=engine.dialect)
                nullable_sql = "" if column.nullable else " NOT NULL"
                connection.execute(
                    text(f'ALTER TABLE "{table.name}" ADD COLUMN "{column.name}" {column_type}{nullable_sql}')
                )
                logger.info("SQLite schema auto-sync applied: %s.%s", table.name, column.name)


def get_db():
    """Dependency for getting a database session in FastAPI routes."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


_connection_tested = False


def test_connection():
    """Test database connection once on app startup."""
    global _connection_tested

    if not _connection_tested:
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
                logger.info("Database connection successful")
            _connection_tested = True
        except Exception as exc:
            logger.error("Database connection failed: %s", exc)
            logger.error("Please check your SQL Server configuration in .env")
            # Do not raise here. Let FastAPI handle missing DB gracefully.
