"""
Shared test setup: SQLite engine, TestClient, cleanup fixture.

─────────────────────────────────────────────────────────────────────────────
NOTE — Isolation entre fichiers de tests
─────────────────────────────────────────────────────────────────────────────
Le pattern canonical "transaction-per-test + rollback" (SQLAlchemy docs)
NE FONCTIONNE PAS avec SQLite :memory: + StaticPool, ni avec SQLite fichier
+ NullPool, à cause de la manière dont SQLite implémente les SAVEPOINTs
(le commit d'un savepoint imbriqué persiste les changements jusque dans le
fichier disque, donc le rollback de la transaction externe ne les annule pas).

Vérifié dans cette session via 3 PoC isolés (cf docs/reports/AUDIT_2026-05-29.md).
Pour une isolation parfaite, deux options :
  1. Migrer les tests vers PostgreSQL/SQL Server (les vrais SGBD respectent
     l'isolation savepoint+rollback)
  2. Faire un drop+recreate par test (lent mais robuste si fait correctement)

En attendant, la fixture ci-dessous utilise DELETE FROM via une session
SQLAlchemy : ça fonctionne pour les tests **intra-fichier** (122+ tests
passent en mode CI individuel), mais quelques tests en suite globale échouent
sur des asserts type `assert N == 0` quand un autre fichier a laissé des
rows committés à travers le pool de connection.
─────────────────────────────────────────────────────────────────────────────
"""
import os
import sys

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient

SERVEUR_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if SERVEUR_DIR not in sys.path:
    sys.path.insert(0, SERVEUR_DIR)

# Force SQLite in-memory for tests BEFORE src.config is loaded
# (config.py builds settings.database_url at import time)
os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ.pop("API_KEY", None)  # tests run in open mode

# Import models first to register them in Base.metadata.
# IMPORTANT : si un modèle n'est pas importé ici, sa table n'est PAS enregistrée
# dans Base.metadata et le cleanup ne la touche pas → fuites entre tests.
from src.database import Base
from src.models.bom import (  # noqa: F401
    BomReference, BomCategory, BomRevision, BomItem, Component,
    MachineFootprintCatalog, MachineFootprintRule,
    ComponentTypeRule, FootprintMapping,
)
from src.models.commands import (  # noqa: F401
    Command, CommandItem, ProductionPlan, PlanAssignment, SupplierOffer, ErpDefaults,
    CommandReceipt,
)
from src.models.machines import PnpCart, PnpFeeder, PnpMachine  # noqa: F401
from src.models.production import Production, ProductionBomRevision  # noqa: F401

SQLALCHEMY_TEST_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    SQLALCHEMY_TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base.metadata.create_all(bind=engine)

# ── Monkey-patch src.database pour garantir le même engine partout ──────────
import src.database as _src_database  # noqa: E402
_src_database.engine = engine
_src_database.SessionLocal = TestingSessionLocal

from src.app import app  # noqa: E402  (import après monkey-patch)
from src.database import get_db as db_get_db  # noqa: E402
from src.routes.bom import bom_file_service, get_db as bom_get_db  # noqa: E402


def override_get_db():
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()


app.dependency_overrides[bom_get_db] = override_get_db
app.dependency_overrides[db_get_db] = override_get_db

client = TestClient(app)


def _purge_all_tables():
    """Vide toutes les tables enregistrées dans Base.metadata.

    Utilise DELETE FROM via une session SQLAlchemy pour rester dans le
    contexte transactionnel/identity-map de l'app.
    """
    from sqlalchemy import text as _text
    sess = TestingSessionLocal()
    try:
        sess.execute(_text("PRAGMA foreign_keys = OFF"))
        for table in reversed(Base.metadata.sorted_tables):
            sess.execute(table.delete())
        sess.commit()
        sess.execute(_text("PRAGMA foreign_keys = ON"))
        sess.commit()
    finally:
        sess.close()


@pytest.fixture(scope="function", autouse=True)
def cleanup_db():
    """Reset the database before and after each test.

    Drop+recreate du schéma (option « robuste » documentée en tête de fichier) :
    contrairement au DELETE FROM, ça réinitialise aussi les compteurs AUTOINCREMENT
    et garantit l'isolation en suite globale (asserts `assert N == 0`, comptages,
    IDs). `_purge_all_tables` reste disponible pour les usages spécifiques.
    """
    from src.utils.catalog_cache import invalidate_all

    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    invalidate_all()  # caches TTL process-level (rules, footprints) — sinon fuite inter-tests
    yield
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    invalidate_all()
