"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-05-23
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Extensions — must precede table creation
    op.execute("CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE")
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    op.execute("CREATE EXTENSION IF NOT EXISTS citext")

    # users
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("email", postgresql.CITEXT(), nullable=False, unique=True),
        sa.Column("password_hash", sa.Text(), nullable=False),
        sa.Column("display_name", sa.Text(), nullable=False),
        sa.Column("role", sa.String(20), nullable=False, server_default="operator"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("last_login_at", sa.DateTime(timezone=True)),
    )

    # goals
    op.create_table(
        "goals",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("target_weight_kg", sa.Numeric(5, 2)),
        sa.Column("target_ldl_mg_dl", sa.Integer()),
        sa.Column("current_ldl_mg_dl", sa.Integer()),
        sa.Column("current_ldl_drawn_at", sa.Date()),
        sa.Column("daily_calorie_target", sa.Integer()),
        sa.Column("daily_sat_fat_g_max", sa.Numeric(5, 2)),
        sa.Column("daily_soluble_fiber_g", sa.Numeric(5, 2)),
        sa.Column("daily_protein_g_min", sa.Numeric(5, 2)),
        sa.Column("dietary_pattern", sa.Text()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )

    # preferences
    op.create_table(
        "preferences",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("kind", sa.Text(), nullable=False),
        sa.Column("value", sa.Text(), nullable=False),
        sa.PrimaryKeyConstraint("user_id", "kind", "value"),
    )

    # foods
    op.create_table(
        "foods",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("source", sa.Text(), nullable=False),
        sa.Column("source_id", sa.Text()),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("brand", sa.Text()),
        sa.Column("serving_size_g", sa.Numeric(7, 2)),
        sa.Column("nutrients_per_100g", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("tags", postgresql.ARRAY(sa.Text())),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("foods_source_id_idx", "foods", ["source", "source_id"])
    op.execute("CREATE INDEX foods_name_trgm ON foods USING gin (name gin_trgm_ops)")

    # recipes
    op.create_table(
        "recipes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE")),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("instructions", postgresql.ARRAY(sa.Text())),
        sa.Column("prep_minutes", sa.Integer()),
        sa.Column("cook_minutes", sa.Integer()),
        sa.Column("servings", sa.Numeric(4, 1), nullable=False, server_default="1"),
        sa.Column("tags", postgresql.ARRAY(sa.Text())),
        sa.Column("source", sa.Text()),
        sa.Column("nutrition_per_serving", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )

    # recipe_ingredients
    op.create_table(
        "recipe_ingredients",
        sa.Column("recipe_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("recipes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("food_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("foods.id")),
        sa.Column("quantity", sa.Numeric(7, 2), nullable=False),
        sa.Column("unit", sa.Text(), nullable=False),
        sa.Column("notes", sa.Text()),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("recipe_id", "sort_order"),
    )

    # meal_plans
    op.create_table(
        "meal_plans",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE")),
        sa.Column("week_start", sa.Date(), nullable=False),
        sa.Column("status", sa.Text(), nullable=False, server_default="active"),
        sa.Column("generation_meta", postgresql.JSONB()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.execute("""
        CREATE UNIQUE INDEX meal_plans_active_idx
        ON meal_plans (user_id, week_start)
        WHERE status = 'active'
    """)

    # meal_plan_slots
    op.create_table(
        "meal_plan_slots",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("plan_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("meal_plans.id", ondelete="CASCADE")),
        sa.Column("slot_date", sa.Date(), nullable=False),
        sa.Column("slot", sa.Text(), nullable=False),
        sa.Column("recipe_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("recipes.id")),
        sa.Column("custom_name", sa.Text()),
        sa.Column("notes", sa.Text()),
    )
    op.create_index("meal_plan_slots_lookup", "meal_plan_slots", ["plan_id", "slot_date"])

    # shopping_list_items
    op.create_table(
        "shopping_list_items",
        sa.Column("plan_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("meal_plans.id", ondelete="CASCADE"), nullable=False),
        sa.Column("food_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("foods.id"), nullable=False),
        sa.Column("quantity", sa.Numeric(7, 2), nullable=False),
        sa.Column("unit", sa.Text(), nullable=False),
        sa.Column("aisle", sa.Text()),
        sa.Column("purchased", sa.Boolean(), nullable=False, server_default="false"),
        sa.PrimaryKeyConstraint("plan_id", "food_id", "unit"),
    )

    # coach_threads
    op.create_table(
        "coach_threads",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE")),
        sa.Column("title", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )

    # coach_messages
    op.create_table(
        "coach_messages",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("thread_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("coach_threads.id", ondelete="CASCADE")),
        sa.Column("role", sa.Text(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("tool_calls", postgresql.JSONB()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )

    # ── Time-series tables ────────────────────────────────────────────────────

    # biometrics (hypertable)
    op.execute("""
        CREATE TABLE biometrics (
            user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            ts          TIMESTAMPTZ NOT NULL,
            metric      TEXT NOT NULL,
            value       DOUBLE PRECISION NOT NULL,
            source      TEXT NOT NULL,
            source_meta JSONB,
            UNIQUE (user_id, ts, metric, source)
        )
    """)
    op.execute("""
        SELECT create_hypertable(
            'biometrics', 'ts',
            chunk_time_interval => INTERVAL '7 days',
            if_not_exists => TRUE
        )
    """)
    op.execute("CREATE INDEX biometrics_user_metric_ts ON biometrics (user_id, metric, ts DESC)")

    # meal_events (hypertable)
    op.execute("""
        CREATE TABLE meal_events (
            id           UUID NOT NULL DEFAULT gen_random_uuid(),
            user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            ts           TIMESTAMPTZ NOT NULL,
            slot         TEXT NOT NULL,
            source       TEXT NOT NULL,
            items        JSONB NOT NULL,
            nutrition    JSONB NOT NULL,
            plan_slot_id UUID REFERENCES meal_plan_slots(id),
            raw_input    TEXT,
            confidence   NUMERIC(3,2),
            PRIMARY KEY (user_id, ts, id)
        )
    """)
    op.execute("""
        SELECT create_hypertable(
            'meal_events', 'ts',
            chunk_time_interval => INTERVAL '30 days',
            if_not_exists => TRUE
        )
    """)

    # alerts (hypertable)
    op.execute("""
        CREATE TABLE alerts (
            id        UUID NOT NULL DEFAULT gen_random_uuid(),
            user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            ts        TIMESTAMPTZ NOT NULL,
            rule_id   TEXT NOT NULL,
            severity  TEXT NOT NULL,
            payload   JSONB NOT NULL,
            narrative TEXT,
            status    TEXT NOT NULL DEFAULT 'open',
            PRIMARY KEY (user_id, ts, id)
        )
    """)
    op.execute("""
        SELECT create_hypertable(
            'alerts', 'ts',
            chunk_time_interval => INTERVAL '30 days',
            if_not_exists => TRUE
        )
    """)

    # ── Continuous aggregate ─────────────────────────────────────────────────
    op.execute("""
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


def downgrade() -> None:
    op.execute("DROP MATERIALIZED VIEW IF EXISTS biometrics_daily CASCADE")
    op.execute("DROP TABLE IF EXISTS alerts CASCADE")
    op.execute("DROP TABLE IF EXISTS meal_events CASCADE")
    op.execute("DROP TABLE IF EXISTS biometrics CASCADE")
    op.drop_table("coach_messages")
    op.drop_table("coach_threads")
    op.drop_table("shopping_list_items")
    op.drop_table("meal_plan_slots")
    op.drop_table("meal_plans")
    op.drop_table("recipe_ingredients")
    op.drop_table("recipes")
    op.drop_table("foods")
    op.drop_table("preferences")
    op.drop_table("goals")
    op.drop_table("users")
