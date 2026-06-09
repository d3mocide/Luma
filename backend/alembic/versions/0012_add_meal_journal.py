"""add meal_journal_entries table

Revision ID: 0012_add_meal_journal
Revises: 0011_food_flags
Create Date: 2026-06-01
"""
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ARRAY, UUID

from alembic import op

revision = '0012_add_meal_journal'
down_revision = '0011_food_flags'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'meal_journal_entries',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('meal_event_id', UUID(as_uuid=True), nullable=True),
        sa.Column('meal_name', sa.Text(), nullable=False),
        sa.Column('logged_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('energy', sa.Integer(), nullable=False),
        sa.Column('digestion', sa.Integer(), nullable=False),
        sa.Column('mood', sa.Integer(), nullable=False),
        sa.Column('satiety', sa.Integer(), nullable=False),
        sa.Column('symptoms', ARRAY(sa.Text()), nullable=False, server_default='{}'),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_journal_user_created', 'meal_journal_entries', ['user_id', 'created_at'])
    op.create_index('ix_journal_meal_event', 'meal_journal_entries', ['meal_event_id'])


def downgrade() -> None:
    op.drop_index('ix_journal_meal_event')
    op.drop_index('ix_journal_user_created')
    op.drop_table('meal_journal_entries')
