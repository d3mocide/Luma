"""add favorites and favorite_items tables

Revision ID: 0013_add_favorites
Revises: 0012_add_meal_journal
Create Date: 2026-06-02
"""
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

from alembic import op

revision = '0013_add_favorites'
down_revision = '0012_add_meal_journal'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'favorites',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('name', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_table(
        'favorite_items',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('favorite_id', UUID(as_uuid=True), sa.ForeignKey('favorites.id', ondelete='CASCADE'), nullable=False),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('food_name', sa.Text(), nullable=False),
        sa.Column('brand', sa.Text(), nullable=True),
        sa.Column('quantity_g', sa.Float(), nullable=False),
        sa.Column('nutrients', JSONB(), nullable=False, server_default='{}'),
    )
    op.create_index('ix_favorites_user_id', 'favorites', ['user_id', 'created_at'])
    op.create_index('ix_favorite_items_fav', 'favorite_items', ['favorite_id', 'sort_order'])


def downgrade() -> None:
    op.drop_index('ix_favorite_items_fav')
    op.drop_index('ix_favorites_user_id')
    op.drop_table('favorite_items')
    op.drop_table('favorites')
