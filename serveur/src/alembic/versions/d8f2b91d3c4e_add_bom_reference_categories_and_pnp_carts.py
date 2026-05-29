"""Add BOM categories, fixed-feeder metadata, and logical PnP carts.

Revision ID: d8f2b91d3c4e
Revises: b31a0f8e6a12
Create Date: 2026-03-25 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "d8f2b91d3c4e"
down_revision = "b31a0f8e6a12"
branch_labels = None
depends_on = None


def upgrade() -> None:
    cart_kind_enum = sa.Enum("COMMON", "CATEGORY", "CUSTOM", name="pnp_cart_kind_enum")

    op.add_column("BOM_REFERENCES", sa.Column("category", sa.String(length=100), nullable=True))
    op.create_index(op.f("ix_BOM_REFERENCES_category"), "BOM_REFERENCES", ["category"], unique=False)

    op.create_table(
        "PNP_CARTS",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("kind", cart_kind_enum, nullable=False),
        sa.Column("target_category", sa.String(length=100), nullable=True),
        sa.Column("capacity_positions", sa.Integer(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_PNP_CARTS_id"), "PNP_CARTS", ["id"], unique=False)
    op.create_index(op.f("ix_PNP_CARTS_name"), "PNP_CARTS", ["name"], unique=True)
    op.create_index(op.f("ix_PNP_CARTS_target_category"), "PNP_CARTS", ["target_category"], unique=False)

    op.add_column("COMPONENTS", sa.Column("is_fixed_feeder", sa.Boolean(), nullable=True))
    op.add_column("COMPONENTS", sa.Column("fixed_cart_id", sa.Integer(), nullable=True))
    op.create_index(op.f("ix_COMPONENTS_fixed_cart_id"), "COMPONENTS", ["fixed_cart_id"], unique=False)
    op.create_foreign_key(
        "fk_components_fixed_cart_id_pnp_carts",
        "COMPONENTS",
        "PNP_CARTS",
        ["fixed_cart_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint("fk_components_fixed_cart_id_pnp_carts", "COMPONENTS", type_="foreignkey")
    op.drop_index(op.f("ix_COMPONENTS_fixed_cart_id"), table_name="COMPONENTS")
    op.drop_column("COMPONENTS", "fixed_cart_id")
    op.drop_column("COMPONENTS", "is_fixed_feeder")

    op.drop_index(op.f("ix_PNP_CARTS_target_category"), table_name="PNP_CARTS")
    op.drop_index(op.f("ix_PNP_CARTS_name"), table_name="PNP_CARTS")
    op.drop_index(op.f("ix_PNP_CARTS_id"), table_name="PNP_CARTS")
    op.drop_table("PNP_CARTS")

    op.drop_index(op.f("ix_BOM_REFERENCES_category"), table_name="BOM_REFERENCES")
    op.drop_column("BOM_REFERENCES", "category")
