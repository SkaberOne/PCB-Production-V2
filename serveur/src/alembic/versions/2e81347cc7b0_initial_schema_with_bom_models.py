"""Initial schema with BOM models

Revision ID: 2e81347cc7b0
Revises: 
Create Date: 2026-03-18 01:47:50.234161

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '2e81347cc7b0'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create initial database schema for BOM module"""
    
    # Create BOM_REFERENCES table
    op.create_table(
        'BOM_REFERENCES',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('reference', sa.String(100), nullable=False),
        sa.Column('description', sa.String(500), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('reference'),
        sa.Index('ix_BOM_REFERENCES_id', 'id'),
        sa.Index('ix_BOM_REFERENCES_reference', 'reference'),
    )
    
    # Create BOM_REVISIONS table
    op.create_table(
        'BOM_REVISIONS',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('bom_ref_id', sa.Integer(), nullable=False),
        sa.Column('revision', sa.String(20), nullable=False),
        sa.Column('type', sa.String(50), nullable=False),  # TOP or BOT
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('status', sa.String(50), nullable=True),  # DRAFT, ACTIVE, ARCHIVED
        sa.ForeignKeyConstraint(['bom_ref_id'], ['BOM_REFERENCES.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.Index('ix_BOM_REVISIONS_id', 'id'),
    )
    
    # Create BOM_ITEMS table
    op.create_table(
        'BOM_ITEMS',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('bom_revision_id', sa.Integer(), nullable=False),
        sa.Column('reference_item', sa.String(50), nullable=False),  # R1, U2, C5
        sa.Column('value_raw', sa.String(100), nullable=True),
        sa.Column('value_harmonized', sa.String(100), nullable=True),
        sa.Column('footprint_eagle', sa.String(100), nullable=True),
        sa.Column('footprint_pnp', sa.String(100), nullable=True),
        sa.Column('quantity', sa.Integer(), nullable=True),
        sa.Column('dnp', sa.Boolean(), nullable=True),  # Do Not Place
        sa.Column('notes', sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(['bom_revision_id'], ['BOM_REVISIONS.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.Index('ix_BOM_ITEMS_id', 'id'),
    )
    
    # Create COMPONENTS table (master component database)
    op.create_table(
        'COMPONENTS',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('reference', sa.String(100), nullable=False),  # RESC0805
        sa.Column('value', sa.String(100), nullable=True),  # 4.7kΩ
        sa.Column('package', sa.String(50), nullable=True),  # 0805, LQFP48
        sa.Column('supplier_code', sa.String(100), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('reference'),
        sa.Index('ix_COMPONENTS_id', 'id'),
        sa.Index('ix_COMPONENTS_reference', 'reference'),
    )
    
    # Create FOOTPRINT_MAPPING table
    op.create_table(
        'FOOTPRINT_MAPPING',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('footprint_eagle', sa.String(100), nullable=False),
        sa.Column('footprint_pnp', sa.String(100), nullable=False),
        sa.Column('machine_compatible', sa.String(50), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.Index('ix_FOOTPRINT_MAPPING_id', 'id'),
    )


def downgrade() -> None:
    """Drop all tables"""
    op.drop_table('FOOTPRINT_MAPPING')
    op.drop_table('COMPONENTS')
    op.drop_table('BOM_ITEMS')
    op.drop_table('BOM_REVISIONS')
    op.drop_table('BOM_REFERENCES')
