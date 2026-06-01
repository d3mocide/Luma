"""add locked column to meal_plan_slots

Revision ID: 0009_slot_locked
Revises: 0008_biometrics_daily_sum
Create Date: 2026-06-01
"""
from alembic import op
import sqlalchemy as sa

revision = '0009_slot_locked'
down_revision = '0008'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('meal_plan_slots', sa.Column('locked', sa.Boolean(), nullable=False, server_default='false'))


def downgrade():
    op.drop_column('meal_plan_slots', 'locked')
