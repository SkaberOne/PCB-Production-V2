"""Tests Alembic — chaîne « baseline » (collapse 2026-06-15).

La chaîne historique (20 migrations) a été archivée dans
``serveur/src/alembic/versions_archive/`` car elle était désynchronisée des
modèles ORM : la table ``PNP_MACHINES`` n'y était jamais créée, donc
``alembic upgrade head`` échouait (``ALTER TABLE PNP_MACHINES ... -> no such
table``). Elle est remplacée par une **baseline unique** (``baseline00001``) qui
construit le schéma courant complet depuis les modèles (cohérent avec le
bootstrap ``create_all`` d'ADR 0008).

Ces tests vérifient la nouvelle réalité : tête unique, ``upgrade head`` depuis
une base vide produit le schéma complet, ``downgrade base`` le retire, et un
aller-retour est idempotent.
"""
import sys
from pathlib import Path

from sqlalchemy import create_engine, inspect
from sqlalchemy.pool import StaticPool

PROJECT_ROOT = Path(__file__).resolve().parents[3]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from alembic.config import Config
from alembic.operations import Operations
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory

BASELINE_REVISION = "baseline00001"
ALEMBIC_INI = str(PROJECT_ROOT / "serveur" / "src" / "alembic.ini")
MIGRATIONS_DIR = str(PROJECT_ROOT / "serveur" / "src" / "alembic")

# Quelques tables clés attendues dans le schéma courant (dont PNP_MACHINES, le
# point de rupture de l'ancienne chaîne).
EXPECTED_TABLES = {"BOM_REFERENCES", "PNP_MACHINES"}


# ── Helpers ──────────────────────────────────────────────────────────────────

def make_sqlite_engine():
    """Fresh in-memory SQLite engine for each test."""
    return create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )


def make_alembic_config(engine) -> Config:
    """Alembic Config branché sur la connexion SQLite en mémoire du test."""
    cfg = Config(ALEMBIC_INI)
    cfg.set_main_option("script_location", MIGRATIONS_DIR)
    cfg.attributes["connection"] = engine.connect()
    return cfg


def script_directory() -> ScriptDirectory:
    cfg = Config(ALEMBIC_INI)
    cfg.set_main_option("script_location", MIGRATIONS_DIR)
    return ScriptDirectory.from_config(cfg)


def run_upgrade(cfg: Config, revision: str) -> None:
    conn = cfg.attributes["connection"]
    script = ScriptDirectory.from_config(cfg)

    def do_upgrade(rev, ctx):
        return script._upgrade_revs(revision, rev)

    mc = MigrationContext.configure(conn, opts={"fn": do_upgrade})
    with mc.begin_transaction():
        with Operations.context(mc):
            mc.run_migrations()


def run_downgrade(cfg: Config, revision: str) -> None:
    conn = cfg.attributes["connection"]
    script = ScriptDirectory.from_config(cfg)

    def do_downgrade(rev, ctx):
        return script._downgrade_revs(revision, rev)

    mc = MigrationContext.configure(conn, opts={"fn": do_downgrade})
    with mc.begin_transaction():
        with Operations.context(mc):
            mc.run_migrations()


# ── Tests ────────────────────────────────────────────────────────────────────

class TestBaselineChain:
    def test_single_head_and_base(self):
        """La chaîne se résume à une seule révision (tête == base == baseline)."""
        script = script_directory()
        assert script.get_heads() == [BASELINE_REVISION]
        assert script.get_bases() == [BASELINE_REVISION]

    def test_upgrade_head_creates_full_schema(self):
        """upgrade head depuis une base vide crée le schéma courant complet."""
        engine = make_sqlite_engine()
        cfg = make_alembic_config(engine)
        run_upgrade(cfg, "head")

        tables = set(inspect(engine).get_table_names())
        assert EXPECTED_TABLES.issubset(tables), (
            f"Tables manquantes : {EXPECTED_TABLES - tables}"
        )
        assert len(tables) >= 20  # schéma complet (28 tables au moment du collapse)

    def test_downgrade_base_drops_app_tables(self):
        """downgrade base retire les tables applicatives."""
        engine = make_sqlite_engine()
        cfg = make_alembic_config(engine)
        run_upgrade(cfg, "head")
        run_downgrade(cfg, "base")

        tables = set(inspect(engine).get_table_names())
        assert "PNP_MACHINES" not in tables
        assert "BOM_REFERENCES" not in tables

    def test_upgrade_downgrade_roundtrip(self):
        """Aller-retour head -> base -> head sans erreur (idempotent)."""
        engine = make_sqlite_engine()
        cfg = make_alembic_config(engine)
        run_upgrade(cfg, "head")
        run_downgrade(cfg, "base")
        run_upgrade(cfg, "head")

        tables = set(inspect(engine).get_table_names())
        assert EXPECTED_TABLES.issubset(tables)


class TestBaselineConsistency:
    def test_baseline_has_no_down_revision(self):
        """La baseline est bien une racine (down_revision = None)."""
        script = script_directory()
        rev = script.get_revision(BASELINE_REVISION)
        assert rev.down_revision is None

    def test_no_gaps_single_revision(self):
        """Une seule révision dans la chaîne active (les anciennes sont archivées)."""
        script = script_directory()
        revs = list(script.walk_revisions())
        assert len(revs) == 1
        assert revs[0].revision == BASELINE_REVISION
