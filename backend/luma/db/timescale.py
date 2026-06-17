"""Helpers for TimescaleDB hypertable creation and management.

These are called from Alembic migrations, not at app startup,
because TimescaleDB DDL is not idempotent via SQLAlchemy schema reflection.
"""


from alembic import op  # type: ignore[attr-defined]


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
