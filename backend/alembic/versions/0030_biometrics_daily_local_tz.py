"""bucket biometrics_daily by SERVER_TIMEZONE instead of UTC

The continuous aggregate bucketed step/energy/etc. samples with
``time_bucket('1 day', ts)``. For a ``timestamptz`` column with no timezone
argument that aligns buckets to **UTC** midnight, regardless of the session
timezone. Everywhere else in the app — ``/today``, streaks, the Trends
"live today" supplement — a calendar day is defined by ``SERVER_TIMEZONE``
(see PR #219). The mismatch meant a user in a negative-offset zone had their
day's steps split across two UTC buckets: the daily totals diverged from
Apple Health's local-day totals, the multi-day average drifted, and the
right-most ("today") point on each chart actually represented a UTC day that
straddled the user's yesterday/today boundary.

This recreates the aggregate with the timezone-aware ``time_bucket`` overload
so each bucket aligns to local midnight in ``SERVER_TIMEZONE``. The timezone
is read from config at migration time and embedded as a literal because a
continuous aggregate definition cannot reference runtime parameters; if
``SERVER_TIMEZONE`` ever changes, a follow-up migration must recreate the view.

A continuous aggregate's columns/definition can't be altered in place, so the
view is dropped and recreated, then fully refreshed so no materialized history
is lost.

Revision ID: 0030
Revises: e1855610d4e4
Create Date: 2026-06-17
"""
from collections.abc import Sequence

from alembic import op

from luma.config import settings

revision: str = "0030"
down_revision: str | None = "e1855610d4e4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _view_sql(bucket: str) -> str:
    return f"""
        CREATE MATERIALIZED VIEW biometrics_daily
        WITH (timescaledb.continuous) AS
        SELECT
            user_id,
            metric,
            {bucket} AS day,
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
    # settings.server_timezone is validated as a real IANA zone in config.py,
    # so it is safe to embed as a SQL literal here.
    tz = settings.server_timezone.replace("'", "''")
    _recreate(_view_sql(f"time_bucket('1 day', ts, '{tz}')"))


def downgrade() -> None:
    _recreate(_view_sql("time_bucket('1 day', ts)"))
