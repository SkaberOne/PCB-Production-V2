"""SQLAlchemy database configuration."""

import logging
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import declarative_base, sessionmaker

# Importé ici (code analysé par PyInstaller) pour garantir l'embarquement
# d'Alembic dans l'exe gelé (migrations au boot — D14).
from alembic import command as _alembic_command
from alembic.config import Config as _AlembicConfig

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


def verify_connection_or_raise() -> None:
    """Fail-fast : vérifie la connexion DB au démarrage, lève si injoignable.

    Appelé au boot pour les bases non-SQLite (SQL Server prod, écart D7). En cas
    d'échec on lève une RuntimeError explicite plutôt que de retomber
    silencieusement en SQLite — un poste mal configuré doit refuser de démarrer
    avec un message clair, pas tourner sur une base locale fantôme.
    """
    # Au démarrage de l'app packagée, Electron + le renderer + le backend gelé se
    # lancent simultanément → forte contention disque/CPU qui peut faire échouer
    # le 1er essai de connexion ODBC (login timeout dépassé → erreur 87). On
    # réessaie donc plusieurs fois avant d'abandonner ; la charge retombe vite et
    # un essai suivant aboutit.
    attempts = 8
    delay_s = 4
    last_exc = None
    for i in range(1, attempts + 1):
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            logger.info(
                "Database connection successful (%s) [essai %d]",
                engine.url.host or engine.url.database, i,
            )
            return
        except Exception as exc:  # noqa: BLE001
            last_exc = exc
            logger.warning("Connexion DB essai %d/%d échouée : %s", i, attempts, str(exc)[:200])
            if i < attempts:
                time.sleep(delay_s)
    raise RuntimeError(
        f"Connexion à la base de données impossible après {attempts} tentatives. "
        f"Vérifiez la configuration SQL Server (hôte, identifiants, pilote ODBC 17) "
        f"dans .env. Détail : {last_exc}"
    ) from last_exc


def _src_dir() -> Path:
    """Dossier ``src`` contenant alembic.ini + alembic/ (gelé ou non)."""
    if getattr(sys, "frozen", False):
        return Path(getattr(sys, "_MEIPASS", ".")) / "src"
    return Path(__file__).resolve().parent  # database.py vit dans src/


def _alembic_config() -> "_AlembicConfig":
    src = _src_dir()
    cfg = _AlembicConfig(str(src / "alembic.ini"))
    cfg.set_main_option("script_location", str(src / "alembic"))
    cfg.set_main_option("sqlalchemy.url", settings.database_url)
    return cfg


def init_or_upgrade_schema() -> None:
    """Met le schéma à niveau au démarrage (D14), de façon idempotente.

    * Base **neuve** (ou pré-Alembic, sans table ``alembic_version``) : on
      construit le schéma courant complet depuis les modèles ORM
      (``create_all`` — source de vérité, contourne une chaîne de migrations
      historique incomplète) puis on **stampe** la révision ``head``.
    * Base **existante** (gérée par Alembic) : on applique les migrations en
      attente (``upgrade head``), additives et rétro-compatibles (cf. ADR 0008).

    Les évolutions futures passent donc par des migrations Alembic normales,
    tout en permettant un déploiement fiable sur une base SQL Server vierge.
    """
    # S'assurer que tous les modèles sont enregistrés sur Base.metadata.
    from . import models  # noqa: F401  (enregistre les tables)

    inspector = inspect(engine)
    has_alembic = "alembic_version" in inspector.get_table_names()
    cfg = _alembic_config()

    if not has_alembic:
        logger.info("Schéma : base neuve → create_all + stamp head")
        Base.metadata.create_all(bind=engine)
        _alembic_command.stamp(cfg, "head")
    else:
        # Base existante. Si sa révision n'existe plus dans le script directory
        # (ancienne chaîne archivée lors du collapse baseline00001), un
        # `upgrade head` échouerait (« Can't locate revision »). On réaligne
        # alors via create_all (idempotent) + stamp head, sans casser la base.
        from alembic.script import ScriptDirectory

        script = ScriptDirectory.from_config(cfg)
        known = {rev.revision for rev in script.walk_revisions()}
        with engine.connect() as conn:
            current = conn.execute(
                text("SELECT version_num FROM alembic_version")
            ).scalar()

        if current not in known:
            logger.warning(
                "Schéma : révision Alembic %s inconnue (chaîne archivée) "
                "→ create_all + stamp head (purge)",
                current,
            )
            Base.metadata.create_all(bind=engine)
            # purge=True : vide alembic_version avant de tamponner, sinon Alembic
            # tente de résoudre la révision orpheline et échoue.
            _alembic_command.stamp(cfg, "head", purge=True)
        else:
            logger.info("Schéma : base existante → alembic upgrade head")
            _alembic_command.upgrade(cfg, "head")


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
