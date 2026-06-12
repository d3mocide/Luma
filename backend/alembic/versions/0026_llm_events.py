"""add llm_events table for per-user AI usage tracking

Revision ID: 0026_llm_events
Revises: 0025_user_data_source
"""
from alembic import op

revision = '0026_llm_events'
down_revision = '0025_user_data_source'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE llm_events (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
            trigger     TEXT NOT NULL DEFAULT '',
            model       TEXT NOT NULL,
            provider    TEXT NOT NULL,
            event       TEXT NOT NULL,
            elapsed_ms  DOUBLE PRECISION,
            prompt_tokens    INTEGER,
            completion_tokens INTEGER,
            total_tokens     INTEGER,
            ts          TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX ix_llm_events_user_ts ON llm_events (user_id, ts)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_llm_events_user_ts")
    op.execute("DROP TABLE IF EXISTS llm_events")
