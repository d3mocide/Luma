"""add_pg_trgm_index

Revision ID: 3b462ff2024e
Revises: 0001
Create Date: 2026-05-26 15:44:45.102665
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '3b462ff2024e'
down_revision: Union[str, None] = '0001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm;")
    op.execute("CREATE INDEX IF NOT EXISTS ix_foods_name_trgm ON foods USING gin (name gin_trgm_ops);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_foods_brand_trgm ON foods USING gin (brand gin_trgm_ops);")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_foods_brand_trgm;")
    op.execute("DROP INDEX IF EXISTS ix_foods_name_trgm;")
    op.execute("DROP EXTENSION IF EXISTS pg_trgm;")
