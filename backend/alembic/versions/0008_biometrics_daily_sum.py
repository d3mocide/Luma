"""add daily sum_value to biometrics_daily aggregate

Cumulative metrics (active_kcal, steps, exercise_min, …) arrive as many small
interval samples, so their meaningful daily figure is the SUM, not the
per-sample average. The continuous aggregate only exposed avg/min/max/last,
which made the Trends charts show per-sample values (~0.25 kcal) instead of
daily totals.

A continuous aggregate's columns can't be altered in place, so the view is
dropped and recreated with a sum_value column, then fully refreshed so no
previously materialized history is lost.

Revision ID: 0008
Revises: 0007
Create Date: 2026-05-31
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0008"
down_revision: Union[str, None] = "0007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_VIEW_WITH_SUM = """
    CREATE MATERIALIZED VIEW biometrics_daily
    WITH (timescaledb.continuous) AS
    SELECT
        user_id,
        metric,
        time_bucket('1 day', ts) AS day,
        avg(value)      AS avg_value,
        min(value)      AS min_value,
        max(value)      AS max_value,
        sum(value)      AS sum_value,
        last(value, ts) AS last_value,
        count(*)        AS sample_count
    FROM biometrics
    GROUP BY user_id, metric, day
    WITH NO DATA
"""

_VIEW_WITHOUT_SUM = """
    CREATE MATERIALIZED VIEW biometrics_daily
    WITH (timescaledb.continuous) AS
    SELECT
        user_id,
        metric,
        time_bucket('1 day', ts) AS day,
        avg(value)      AS avg_value,
        min(value)      AS min_value,
        max(value)      AS max_value,
        last(value, ts) AS last_value,
        count(*)        AS sample_count
    FROM biometrics
    GROUP BY user_id, metric, day
    WITH NO DATA
"""

_POLICY = """
    SELECT add_continuous_aggregate_policy(
        'biometrics_daily',
        start_offset      => INTERVAL '14 days',
        end_offset        => INTERVAL '1 hour',
        schedule_interval => INTERVAL '1 hour',
        if_not_exists     => TRUE
    )
"""


def _recreate(view_sql: str) -> None:
    op.execute("DROP MATERIALIZED VIEW IF EXISTS biometrics_daily CASCADE")
    op.execute(view_sql)
    op.execute(_POLICY)
    # WITH NO DATA leaves the view empty; refresh the full history so older
    # ranges (30d/90d/1y) keep working. refresh_continuous_aggregate cannot run
    # inside a transaction, so step outside Alembic's transaction block.
    with op.get_context().autocommit_block():
        op.execute("CALL refresh_continuous_aggregate('biometrics_daily', NULL, NULL)")


def upgrade() -> None:
    _recreate(_VIEW_WITH_SUM)


def downgrade() -> None:
    _recreate(_VIEW_WITHOUT_SUM)
