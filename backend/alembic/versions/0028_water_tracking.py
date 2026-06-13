"""water tracking: water_logs table + user hydration prefs

Revision ID: 0028_water_tracking
Revises: 0027_readd_case_file
Create Date: 2026-06-13
"""
import sqlalchemy as sa

from alembic import op

revision = '0028_water_tracking'
down_revision = '0027_readd_case_file'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'water_logs',
        sa.Column('id', sa.UUID(), primary_key=True),
        sa.Column('user_id', sa.UUID(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('amount_ml', sa.Integer(), nullable=False),
        sa.Column('ts', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
    )
    op.create_index('ix_water_logs_user_id', 'water_logs', ['user_id'])
    op.create_index('ix_water_logs_ts', 'water_logs', ['ts'])
    op.add_column('users', sa.Column('water_goal_ml', sa.Integer(), nullable=False, server_default='2000'))
    op.add_column('users', sa.Column('water_glass_ml', sa.Integer(), nullable=False, server_default='250'))
    op.add_column('users', sa.Column('water_buddy', sa.Text(), nullable=False, server_default="'frog'"))


def downgrade() -> None:
    op.drop_column('users', 'water_buddy')
    op.drop_column('users', 'water_glass_ml')
    op.drop_column('users', 'water_goal_ml')
    op.drop_index('ix_water_logs_ts', table_name='water_logs')
    op.drop_index('ix_water_logs_user_id', table_name='water_logs')
    op.drop_table('water_logs')
