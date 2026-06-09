"""dedupe biometrics across sources

Apple Health bulk exports report the same measurement instant from multiple
devices (e.g. Apple Watch *and* iPhone). The original UNIQUE key included
`source`, so those overlapping readings were stored as separate rows and then
double-counted by every SUM downstream — inflating active/basal energy totals
(and pinning recommended-calorie TDEE to the safety clamp).

This migration collapses biometrics to one row per (user_id, ts, metric),
keeping the highest-priority source, and changes the uniqueness key so future
ingests stay deduped.

Revision ID: 0007
Revises: 0006
Create Date: 2026-05-31
"""
from collections.abc import Sequence

from alembic import op

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Source-priority rule, shared by the backfill below and by the ingest
    # upsert (luma/services/hae_normalizer.py). Watch readings win over phone,
    # which win over anything else. IMMUTABLE so it can be used in index/WHERE.
    op.execute("""
        CREATE OR REPLACE FUNCTION biometric_source_priority(src text)
        RETURNS int LANGUAGE sql IMMUTABLE AS $$
            SELECT CASE
                WHEN src ILIKE '%watch%' THEN 3
                WHEN src ILIKE '%phone%' THEN 2
                ELSE 1
            END
        $$
    """)

    # Backfill: drop every row that is out-ranked by another row sharing the
    # same (user_id, ts, metric). Ties (equal priority) are broken by the
    # lexicographically smaller source so exactly one row survives per key.
    op.execute("""
        DELETE FROM biometrics b
        WHERE EXISTS (
            SELECT 1 FROM biometrics b2
            WHERE b2.user_id = b.user_id
              AND b2.ts      = b.ts
              AND b2.metric  = b.metric
              AND b2.source <> b.source
              AND (
                  biometric_source_priority(b2.source) > biometric_source_priority(b.source)
                  OR (
                      biometric_source_priority(b2.source) = biometric_source_priority(b.source)
                      AND b2.source < b.source
                  )
              )
        )
    """)

    op.execute("ALTER TABLE biometrics DROP CONSTRAINT IF EXISTS biometrics_user_id_ts_metric_source_key")
    op.execute("ALTER TABLE biometrics ADD CONSTRAINT biometrics_user_ts_metric_key UNIQUE (user_id, ts, metric)")


def downgrade() -> None:
    op.execute("ALTER TABLE biometrics DROP CONSTRAINT IF EXISTS biometrics_user_ts_metric_key")
    op.execute("ALTER TABLE biometrics ADD CONSTRAINT biometrics_user_id_ts_metric_source_key UNIQUE (user_id, ts, metric, source)")
    op.execute("DROP FUNCTION IF EXISTS biometric_source_priority(text)")
