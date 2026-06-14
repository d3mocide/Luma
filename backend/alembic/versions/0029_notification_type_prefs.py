"""notification type prefs: per-type opt-out for weekly recap + health alerts

Revision ID: 0029_notification_type_prefs
Revises: 0028_water_tracking
Create Date: 2026-06-14

Default TRUE so existing users keep receiving the recap and health alerts they
already get today (these notifications previously had no opt-out at all).
"""
import sqlalchemy as sa

from alembic import op

revision = '0029_notification_type_prefs'
down_revision = '0028_water_tracking'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('users', sa.Column('recap_enabled', sa.Boolean(), nullable=False, server_default='true'))
    op.add_column('users', sa.Column('health_alerts_enabled', sa.Boolean(), nullable=False, server_default='true'))


def downgrade() -> None:
    op.drop_column('users', 'health_alerts_enabled')
    op.drop_column('users', 'recap_enabled')
