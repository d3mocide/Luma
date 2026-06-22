"""Keep the saved user profile in sync with measured health data.

- activity_level: rewritten from trailing 7-day step data when we have enough
  of it (fully automatic — objective steps are more reliable than a self-report
  that's often a stale default). Skipped when step data is sparse so we never
  clobber a profile on missing data.
- height_cm: filled from the latest ingested height reading only when the
  profile height is blank (never overwrites a manual entry).
"""
from __future__ import annotations

import logging
from datetime import UTC, datetime, time, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from luma.config import settings
from luma.db.models import User
from luma.services.body_metrics import resolve_synced_activity_level

logger = logging.getLogger(__name__)

# Mirror the auth.py profile bounds so we never store an absurd ingested height.
_HEIGHT_MIN_CM, _HEIGHT_MAX_CM = 50.0, 280.0


async def sync_user_profile(user_id: str, db: AsyncSession) -> dict[str, str | None]:
    """Reconcile one user's profile against measured biometrics. Returns a small
    summary of what changed (for logging)."""
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if user is None:
        return {}

    tz = ZoneInfo(settings.server_timezone)
    today_dt = datetime.now(tz).date()
    start_ts = datetime.combine(today_dt - timedelta(days=7), time.min, tzinfo=tz).astimezone(UTC)
    end_ts = datetime.combine(today_dt, time.min, tzinfo=tz).astimezone(UTC)

    steps_row = (
        await db.execute(
            text("""
                SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY daily_total) AS median_daily,
                       COUNT(*) AS day_count
                FROM (
                    SELECT date_trunc('day', ts AT TIME ZONE :tz) AS day, SUM(value) AS daily_total
                    FROM biometrics
                    WHERE user_id = :uid AND metric = 'steps'
                      AND ts >= :start AND ts < :end
                    GROUP BY day
                ) s
            """),
            {"uid": str(user_id), "tz": settings.server_timezone, "start": start_ts, "end": end_ts},
        )
    ).first()
    steps_avg = float(steps_row.median_daily) if steps_row and steps_row.median_daily is not None else 0.0
    steps_days = int(steps_row.day_count) if steps_row and steps_row.day_count else 0

    # Weekly Apple exercise minutes — corroborates non-step activity (cycling,
    # swimming) so we don't downgrade a genuine exerciser who logs few steps.
    weekly_exercise_min = float(
        (
            await db.execute(
                text("""
                    SELECT COALESCE(SUM(value), 0)
                    FROM biometrics
                    WHERE user_id = :uid AND metric = 'exercise_min'
                      AND ts >= :start AND ts < :end
                """),
                {"uid": str(user_id), "start": start_ts, "end": end_ts},
            )
        ).scalar()
        or 0.0
    )

    changes: dict[str, str | None] = {}

    # activity_level — fully automatic overwrite when step data is robust, with
    # an exercise-minutes guard against downgrading regular non-step exercisers.
    level = resolve_synced_activity_level(steps_avg, steps_days, user.activity_level, weekly_exercise_min)
    if level is not None and user.activity_level != level:
        changes["activity_level"] = f"{user.activity_level} → {level}"
        user.activity_level = level

    # height_cm — fill only when the profile value is missing.
    if user.height_cm is None:
        height_row = (
            await db.execute(
                text("SELECT value FROM biometrics WHERE user_id = :uid AND metric = 'height_cm' ORDER BY ts DESC LIMIT 1"),
                {"uid": str(user_id)},
            )
        ).first()
        if height_row and _HEIGHT_MIN_CM <= float(height_row[0]) <= _HEIGHT_MAX_CM:
            user.height_cm = Decimal(str(round(float(height_row[0]), 1)))
            changes["height_cm"] = f"set {user.height_cm}"

    if changes:
        await db.commit()
        logger.info("Profile sync for user %s: %s", user_id, changes)

    return changes
