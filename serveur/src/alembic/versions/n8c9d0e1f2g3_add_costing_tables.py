"""add costing tables (COST_PARAMETERS, PRODUCTION_COST_INPUT, PRODUCTION_COSTING)

Revision ID: n8c9d0e1f2g3
Revises: m7b8c9d0e1f2
Create Date: 2026-06-09

Onglet « Prix carte à la production » — cf. ADR 0005 /
docs/audits/Audit_2026-06-09_prix_carte_production.md.
"""

from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "n8c9d0e1f2g3"
down_revision: Union[str, None] = "m7b8c9d0e1f2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "COST_PARAMETERS",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("labor_rate", sa.Float(), nullable=False, server_default="40"),
        sa.Column("vat_pct", sa.Float(), nullable=False, server_default="20"),
        sa.Column("solder_paste_per_board", sa.Float(), nullable=False, server_default="2"),
        sa.Column("defect_rate_pct", sa.Float(), nullable=False, server_default="10"),
        sa.Column("repair_time_h", sa.Float(), nullable=False, server_default="3"),
        sa.Column("test_time_h", sa.Float(), nullable=False, server_default="1"),
        sa.Column("prep_time_bom_h", sa.Float(), nullable=False, server_default="0.1"),
        sa.Column("prep_time_top_h", sa.Float(), nullable=False, server_default="0.1"),
        sa.Column("prep_time_bot_h", sa.Float(), nullable=False, server_default="0"),
        sa.Column("machine_rate", sa.Float(), nullable=True),
        sa.Column("overhead_rate", sa.Float(), nullable=True),
        sa.Column("margin_pct", sa.Float(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_COST_PARAMETERS_id"), "COST_PARAMETERS", ["id"], unique=False)

    op.create_table(
        "PRODUCTION_COST_INPUT",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("production_id", sa.Integer(), nullable=False),
        sa.Column("quantity_produced", sa.Integer(), nullable=True),
        sa.Column("pcb_total_price", sa.Float(), nullable=True),
        sa.Column("stencil_cost", sa.Float(), nullable=True),
        sa.Column("amortize_stencil", sa.Boolean(), nullable=False, server_default="1"),
        sa.Column("assembly_time_top_h", sa.Float(), nullable=True),
        sa.Column("assembly_time_bot_h", sa.Float(), nullable=True),
        sa.Column("tht_time_h", sa.Float(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["production_id"], ["PRODUCTIONS.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("production_id"),
    )
    op.create_index(
        op.f("ix_PRODUCTION_COST_INPUT_id"), "PRODUCTION_COST_INPUT", ["id"], unique=False
    )
    op.create_index(
        op.f("ix_PRODUCTION_COST_INPUT_production_id"),
        "PRODUCTION_COST_INPUT",
        ["production_id"],
        unique=False,
    )

    op.create_table(
        "PRODUCTION_COSTING",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("bom_reference_id", sa.Integer(), nullable=False),
        sa.Column("production_id", sa.Integer(), nullable=True),
        sa.Column("quantity", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("unit_cost_ht", sa.Float(), nullable=False, server_default="0"),
        sa.Column("unit_cost_ttc", sa.Float(), nullable=False, server_default="0"),
        sa.Column("total_ht", sa.Float(), nullable=False, server_default="0"),
        sa.Column("total_ttc", sa.Float(), nullable=False, server_default="0"),
        sa.Column("material_cost", sa.Float(), nullable=False, server_default="0"),
        sa.Column("labor_cost", sa.Float(), nullable=False, server_default="0"),
        sa.Column("nre_cost", sa.Float(), nullable=False, server_default="0"),
        sa.Column("is_reference", sa.Boolean(), nullable=False, server_default="1"),
        sa.Column("computed_at", sa.DateTime(), nullable=True),
        sa.Column("params_snapshot", sa.Text(), nullable=True),
        sa.Column("machine_cost", sa.Float(), nullable=True),
        sa.Column("overhead_cost", sa.Float(), nullable=True),
        sa.Column("margin_amount", sa.Float(), nullable=True),
        sa.Column("sell_price", sa.Float(), nullable=True),
        sa.ForeignKeyConstraint(["bom_reference_id"], ["BOM_REFERENCES.id"]),
        sa.ForeignKeyConstraint(["production_id"], ["PRODUCTIONS.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_PRODUCTION_COSTING_id"), "PRODUCTION_COSTING", ["id"], unique=False)
    op.create_index(
        op.f("ix_PRODUCTION_COSTING_bom_reference_id"),
        "PRODUCTION_COSTING",
        ["bom_reference_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_PRODUCTION_COSTING_production_id"),
        "PRODUCTION_COSTING",
        ["production_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_PRODUCTION_COSTING_computed_at"),
        "PRODUCTION_COSTING",
        ["computed_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_table("PRODUCTION_COSTING")
    op.drop_table("PRODUCTION_COST_INPUT")
    op.drop_table("COST_PARAMETERS")
