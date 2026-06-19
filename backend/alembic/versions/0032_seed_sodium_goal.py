"""seed daily_sodium_mg_max for existing goals

Sodium replaced added sugar as the third budgeted ceiling. Existing users who
had already configured goals would otherwise see an empty third ring until they
set a sodium target by hand, so backfill a sensible default for any goals row
that doesn't have one yet. The default mirrors the goal-recommendation logic:
the stricter 1,500 mg/day ideal when the user is actively managing LDL, else the
AHA upper limit of 2,300 mg/day.

Revision ID: 0032_seed_sodium_goal
Revises: 0031_add_sodium_goal
"""
from alembic import op

revision = '0032_seed_sodium_goal'
down_revision = '0031_add_sodium_goal'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE goals
        SET daily_sodium_mg_max = CASE
            WHEN target_ldl_mg_dl IS NOT NULL THEN 1500
            ELSE 2300
        END
        WHERE daily_sodium_mg_max IS NULL
        """
    )


def downgrade() -> None:
    # Data backfill only — the pre-seed values are indistinguishable from any the
    # user has since set, so there is nothing safe to reverse.
    pass
