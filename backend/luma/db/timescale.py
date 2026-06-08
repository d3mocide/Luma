"""Helpers for TimescaleDB hypertable creation and management.

These are called from Alembic migrations, not at app startup,
because TimescaleDB DDL is not idempotent via SQLAlchemy schema reflection.
"""


from alembic import op


def create_hypertables() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE")
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    op.execute("CREATE EXTENSION IF NOT EXISTS citext")

    # biometrics
    op.execute("""
        SELECT create_hypertable(
            'biometrics', 'ts',
            chunk_time_interval => INTERVAL '7 days',
            if_not_exists => TRUE
        )
    """)

    # meal_events
    op.execute("""
        SELECT create_hypertable(
            'meal_events', 'ts',
            chunk_time_interval => INTERVAL '30 days',
            if_not_exists => TRUE
        )
    """)

    # alerts
    op.execute("""
        SELECT create_hypertable(
            'alerts', 'ts',
            chunk_time_interval => INTERVAL '30 days',
            if_not_exists => TRUE
        )
    """)


def create_continuous_aggregates() -> None:
    op.execute("""
        CREATE MATERIALIZED VIEW IF NOT EXISTS biometrics_daily
        WITH (timescaledb.continuous) AS
        SELECT
            user_id,
            metric,
            time_bucket('1 day', ts) AS day,
            avg(value)        AS avg_value,
            min(value)        AS min_value,
            max(value)        AS max_value,
            sum(value)        AS sum_value,
            last(value, ts)   AS last_value,
            count(*)          AS sample_count
        FROM biometrics
        GROUP BY user_id, metric, day
        WITH NO DATA
    """)

    op.execute("""
        SELECT add_continuous_aggregate_policy(
            'biometrics_daily',
            start_offset      => INTERVAL '14 days',
            end_offset        => INTERVAL '1 hour',
            schedule_interval => INTERVAL '1 hour',
            if_not_exists     => TRUE
        )
    """)
