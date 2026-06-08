import logging
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from typing import Annotated, Any, Literal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Query
from sqlalchemy import text

from luma.config import settings
from luma.deps import CurrentUser, DbDep

logger = logging.getLogger(__name__)
router = APIRouter()

VALID_METRICS = {
    # Body composition
    "weight_kg", "bmi", "body_fat_pct", "lean_body_mass_kg",
    # Cardiovascular
    "hrv_ms", "rhr_bpm", "heart_rate_avg_bpm", "walking_hr_bpm", "respiratory_rate_bpm",
    # Energy
    "active_kcal", "bmr_kcal", "physical_effort_kcal_hr_kg",
    # Activity
    "steps", "flights_climbed", "exercise_min", "stand_min", "stand_hours",
    "distance_km", "daylight_min",
    # Sleep
    "sleep_duration_min", "sleep_asleep_min", "sleep_score",
    "wrist_temp_c", "breathing_disturbances",
    # Gait
    "walking_speed_kmh", "step_length_cm", "walking_asymmetry_pct",
    "double_support_pct", "stair_speed_up_mps", "stair_speed_down_mps",
    "six_min_walk_m",
    # Environment
    "audio_exposure_db",
}

RANGE_TO_DAYS = {"7d": 7, "30d": 30, "90d": 90, "1y": 365}


async def _live_today_row(db: Any, user_id: str, metric: str) -> SimpleNamespace | None:
    """Query today's data directly from biometrics when the aggregate hasn't caught up."""
    tz = ZoneInfo(settings.server_timezone)
    today_local = datetime.now(tz).date()
    today_start = datetime(today_local.year, today_local.month, today_local.day, tzinfo=tz).astimezone(UTC)
    today_end = today_start + timedelta(days=1)

    agg = await db.execute(
        text("""
            SELECT avg(value) AS avg_val, min(value) AS min_val,
                   max(value) AS max_val, sum(value) AS sum_val,
                   count(*)   AS cnt
            FROM biometrics
            WHERE user_id = :uid AND metric = :m
              AND ts >= :ts0 AND ts < :ts1
        """),
        {"uid": user_id, "m": metric, "ts0": today_start, "ts1": today_end},
    )
    agg_row = agg.fetchone()
    if not agg_row or not agg_row.cnt:
        return None

    last_r = await db.execute(
        text("""
            SELECT value FROM biometrics
            WHERE user_id = :uid AND metric = :m
              AND ts >= :ts0 AND ts < :ts1
            ORDER BY ts DESC LIMIT 1
        """),
        {"uid": user_id, "m": metric, "ts0": today_start, "ts1": today_end},
    )
    last_row = last_r.fetchone()
    return SimpleNamespace(
        date=str(today_local),
        avg_value=agg_row.avg_val,
        min_value=agg_row.min_val,
        max_value=agg_row.max_val,
        sum_value=agg_row.sum_val,
        last_value=last_row.value if last_row else agg_row.avg_val,
        sample_count=agg_row.cnt,
    )


@router.get("/{metric}")
async def get_trend(
    metric: str,
    user: CurrentUser,
    db: DbDep,
    range: Annotated[Literal["7d", "30d", "90d", "1y"], Query()] = "30d",
) -> dict[str, Any]:
    if metric not in VALID_METRICS:
        from fastapi import HTTPException, status
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unknown metric: {metric}")

    days = RANGE_TO_DAYS[range]

    result = await db.execute(
        text("""
            SELECT
                CAST(day::date AS text) AS date,
                avg_value,
                min_value,
                max_value,
                sum_value,
                last_value,
                sample_count
            FROM biometrics_daily
            WHERE user_id = :user_id
              AND metric   = :metric
              AND day      >= now() - (:days * INTERVAL '1 day')
            ORDER BY day
        """),
        {"user_id": str(user.id), "metric": metric, "days": days},
    )
    rows = list(result.fetchall())

    # Supplement with a live query when the continuous aggregate hasn't
    # materialized today's bucket yet (aggregate refresh lags by up to 1 hour).
    today_str = str(datetime.now(ZoneInfo(settings.server_timezone)).date())
    if not rows or rows[-1].date != today_str:
        live = await _live_today_row(db, str(user.id), metric)
        if live:
            rows.append(live)

    return {
        "metric": metric,
        "range": range,
        "series": [
            {
                "date":        r.date,
                "avg":         r.avg_value,
                "min":         r.min_value,
                "max":         r.max_value,
                "sum":         r.sum_value,
                "last":        r.last_value,
                "sample_count": r.sample_count,
            }
            for r in rows
        ],
    }


@router.get("")
async def list_latest(user: CurrentUser, db: DbDep) -> dict[str, Any]:
    result = await db.execute(
        text("""
            SELECT DISTINCT ON (metric)
                metric, value, ts
            FROM biometrics
            WHERE user_id = :user_id
            ORDER BY metric, ts DESC
        """),
        {"user_id": str(user.id)},
    )
    return {"latest": {r.metric: {"value": r.value, "ts": r.ts.isoformat()} for r in result}}
