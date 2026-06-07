from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, CITEXT

revision = '0016_family_sharing'
down_revision = '0015_user_profile'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'family_groups',
        sa.Column('id', UUID(), primary_key=True, nullable=False),
        sa.Column('name', sa.Text(), nullable=False),
        sa.Column('created_by', UUID(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        'family_members',
        sa.Column('group_id', UUID(), sa.ForeignKey('family_groups.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', UUID(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('role', sa.Text(), nullable=False, server_default='member'),
        sa.Column('joined_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('group_id', 'user_id'),
    )
    op.create_index('ix_family_members_user_id', 'family_members', ['user_id'])

    op.create_table(
        'family_invitations',
        sa.Column('id', UUID(), primary_key=True, nullable=False),
        sa.Column('group_id', UUID(), sa.ForeignKey('family_groups.id', ondelete='CASCADE'), nullable=False),
        sa.Column('invited_email', CITEXT(), nullable=False),
        sa.Column('invited_by', UUID(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('token', sa.Text(), unique=True, nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('accepted_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_family_invitations_token', 'family_invitations', ['token'], unique=True)

    op.create_table(
        'group_shares',
        sa.Column('id', UUID(), primary_key=True, nullable=False),
        sa.Column('group_id', UUID(), sa.ForeignKey('family_groups.id', ondelete='CASCADE'), nullable=False),
        sa.Column('resource_type', sa.Text(), nullable=False),
        sa.Column('resource_id', UUID(), nullable=False),
        sa.Column('shared_by', UUID(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('shared_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_group_shares_group_id', 'group_shares', ['group_id'])


def downgrade() -> None:
    op.drop_table('group_shares')
    op.drop_table('family_invitations')
    op.drop_table('family_members')
    op.drop_table('family_groups')
