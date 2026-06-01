"""
Alembic migration tests: verify every migration can upgrade and downgrade cleanly.

Strategy:
- Runs migrations against an in-memory SQLite database.
- Tests the full upgrade chain from base → head.
- Tests the full downgrade chain from head → base.
- Tests each individual step (up then down) in isolation.
"""
import os
import sys
from pathlib import Path

import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.pool import StaticPool

PROJECT_ROOT = Path(__file__).resolve().parents[3]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from alembic.config import Config
from alembic import command as alembic_command
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory

# ── Migration revision chain (oldest → newest) ───────────────────────────────

REVISION_CHAIN = [
    "2e81347cc7b0",  # initial_schema_with_bom_models
    "7a6f2c0f1e90",  # add_bom_item_review_fields
    "9c1f4a0c8f2b",  # extend_component_library_fields
    "4d1f8d5e2c19",  # add_pitch_mm_to_components
    "b31a0f8e6a12",  # add_production_workspaces
    "d8f2b91d3c4e",  # add_bom_reference_categories_and_pnp_carts
    "f6c3b12a9d44",  # add_bom_categories_catalog
    "7b4a1c2e9f10",  # add_machine_link_to_productions
    "c4f7d9e21a8b",  # add_production_order_fields
    "e1a3b7c9d4f2",  # add_quantity_to_production_bom_revisions
]

HEAD_REVISION = REVISION_CHAIN[-1]
# Layout actuel : serveur/src/alembic.ini + serveur/src/alembic/
# Ancien (obsolète) : src/backend/alembic — laissé pour mémoire seulement
ALEMBIC_INI = str(PROJECT_ROOT / "serveur" / "src" / "alembic.ini")
MIGRATIONS_DIR = str(PROJECT_ROOT / "serveur" / "src" / "alembic")


# ── Helpers ───────────────────────────────────────────────────────────────────

def make_sqlite_engine():
    """Fresh in-memory SQLite engine for each test."""
    return create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )


def make_alembic_config(engine) -> Config:
    """Build an Alembic Config that uses the given engine instead of the real DB URL."""
    cfg = Config(ALEMBIC_INI)
    cfg.set_main_option("script_location", MIGRATIONS_DIR)
    # Override the URL so Alembic talks to the in-memory SQLite engine
    cfg.attributes["connection"] = engine.connect()
    return cfg


def run_upgrade(cfg: Config, revision: str) -> None:
    """Run alembic upgrade to the given revision using the pre-opened connection."""
    conn = cfg.attributes["connection"]
    mc = MigrationContext.configure(conn)
    script = ScriptDirectory.from_config(cfg)

    def do_upgrade(rev, ctx):
        return script._upgrade_revs(revision, rev)

    with mc.begin_transaction():
        mc.run_migrations(fn=do_upgrade)


def run_downgrade(cfg: Config, revision: str) -> None:
    """Run alembic downgrade to the given revision (or 'base') using the pre-opened connection."""
    conn = cfg.attributes["connection"]
    mc = MigrationContext.configure(conn)
    script = ScriptDirectory.from_config(cfg)

    def do_downgrade(rev, ctx):
        return script._downgrade_revs(revision, rev)

    with mc.begin_transaction():
        mc.run_migrations(fn=do_downgrade)


def get_current_revision(conn) -> str | None:
    """Read the current alembic_version from the database."""
    mc = MigrationContext.configure(conn)
    return mc.get_current_revision()


# ── Tests: full chain ─────────────────────────────────────────────────────────

class TestFullMigrationChain:
    def test_upgrade_head_from_base(self):
        """All migrations run cleanly from scratch to head."""
        engine = make_sqlite_engine()
        cfg = make_alembic_config(engine)
        conn = cfg.attributes["connection"]

        run_upgrade(cfg, HEAD_REVISION)

        current = get_current_revision(conn)
        assert current == HEAD_REVISION
        conn.close()

    def test_downgrade_base_from_head(self):
        """All migrations can be rolled back from head to base."""
        engine = make_sqlite_engine()
        cfg = make_alembic_config(engine)
        conn = cfg.attributes["connection"]

        run_upgrade(cfg, HEAD_REVISION)
        run_downgrade(cfg, "base")

        current = get_current_revision(conn)
        assert current is None  # base = no revision recorded
        conn.close()

    def test_upgrade_then_downgrade_full_roundtrip(self):
        """Full up → down → up cycle produces the same head revision."""
        engine = make_sqlite_engine()
        cfg = make_alembic_config(engine)
        conn = cfg.attributes["connection"]

        run_upgrade(cfg, HEAD_REVISION)
        run_downgrade(cfg, "base")
        run_upgrade(cfg, HEAD_REVISION)

        current = get_current_revision(conn)
        assert current == HEAD_REVISION
        conn.close()

    def test_head_revision_tables_exist(self):
        """After upgrade to head, core tables must be present."""
        engine = make_sqlite_engine()
        cfg = make_alembic_config(engine)
        conn = cfg.attributes["connection"]

        run_upgrade(cfg, HEAD_REVISION)

        inspector = inspect(engine)
        tables = set(inspector.get_table_names())
        expected = {
            "BOM_REFERENCES",
            "BOM_REVISIONS",
            "BOM_ITEMS",
            "COMPONENTS",
            "PNP_MACHINES",
            "PNP_FEEDERS",
            "PNP_CARTS",
            "PRODUCTIONS",
            "PRODUCTION_BOM_REVISIONS",
        }
        missing = expected - tables
        assert not missing, f"Tables missing after full upgrade: {missing}"
        conn.close()

    def test_base_has_no_app_tables(self):
        """After downgrade to base, application tables should be gone."""
        engine = make_sqlite_engine()
        cfg = make_alembic_config(engine)
        conn = cfg.attributes["connection"]

        run_upgrade(cfg, HEAD_REVISION)
        run_downgrade(cfg, "base")

        inspector = inspect(engine)
        tables = set(inspector.get_table_names())
        app_tables = {t for t in tables if t not in ("alembic_version",)}
        assert not app_tables, f"Unexpected tables after downgrade to base: {app_tables}"
        conn.close()


# ── Tests: individual step up/down ────────────────────────────────────────────

class TestIndividualMigrationSteps:
    """Each migration: upgrade to it, then downgrade back one step."""

    @pytest.mark.parametrize("target_rev,prev_rev", [
        (REVISION_CHAIN[0], "base"),
        *[(REVISION_CHAIN[i], REVISION_CHAIN[i - 1]) for i in range(1, len(REVISION_CHAIN))],
    ])
    def test_step_up_then_down(self, target_rev, prev_rev):
        """
        Upgrade to prev_rev (or base), then step up to target_rev,
        then step back down — verify we return to prev_rev (or None).
        """
        engine = make_sqlite_engine()
        cfg = make_alembic_config(engine)
        conn = cfg.attributes["connection"]

        # Bring DB to the state just before this migration
        if prev_rev != "base":
            run_upgrade(cfg, prev_rev)

        # Apply this migration
        run_upgrade(cfg, target_rev)
        assert get_current_revision(conn) == target_rev

        # Roll it back
        run_downgrade(cfg, prev_rev)
        expected_rev = None if prev_rev == "base" else prev_rev
        assert get_current_revision(conn) == expected_rev

        conn.close()


# ── Tests: script consistency ─────────────────────────────────────────────────

class TestMigrationScriptConsistency:
    def test_no_duplicate_revision_ids(self):
        """Each revision ID is unique across all migration files."""
        cfg = Config(ALEMBIC_INI)
        cfg.set_main_option("script_location", MIGRATIONS_DIR)
        script = ScriptDirectory.from_config(cfg)

        all_revisions = [sc.revision for sc in script.walk_revisions()]
        assert len(all_revisions) == len(set(all_revisions)), "Duplicate revision IDs found"

    def test_chain_has_no_gaps(self):
        """The revision chain forms a single linear sequence with no gaps."""
        cfg = Config(ALEMBIC_INI)
        cfg.set_main_option("script_location", MIGRATIONS_DIR)
        script = ScriptDirectory.from_config(cfg)

        # Walk from head to base; should visit every revision in REVISION_CHAIN
        heads = script.get_heads()
        assert len(heads) == 1, f"Expected single head, got: {heads}"
        assert heads[0] == HEAD_REVISION

        walked = [sc.revision for sc in script.walk_revisions()]
        assert set(walked) == set(REVISION_CHAIN), (
            f"Chain mismatch. Extra: {set(walked) - set(REVISION_CHAIN)}, "
            f"Missing: {set(REVISION_CHAIN) - set(walked)}"
        )

    def test_revision_chain_matches_expected_order(self):
        """The REVISION_CHAIN list matches the actual Alembic down_revision links."""
        cfg = Config(ALEMBIC_INI)
        cfg.set_main_option("script_location", MIGRATIONS_DIR)
        script = ScriptDirectory.from_config(cfg)

        revision_map = {sc.revision: sc.down_revision for sc in script.walk_revisions()}

        # Verify each step in REVISION_CHAIN matches the actual down_revision
        for i, rev in enumerate(REVISION_CHAIN):
            expected_down = None if i == 0 else REVISION_CHAIN[i - 1]
            actual_down = revision_map.get(rev)
            assert actual_down == expected_down, (
                f"Revision {rev}: expected down_revision={expected_down}, got {actual_down}"
            )
