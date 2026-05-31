import logging
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Query
from sqlalchemy import text

from luma.deps import CurrentUser, DbDep

logger = logging.getLogger(__name__)
router = APIRouter()

VALID_METRICS = {
    # Body composition
    "weight_kg", "bmi", "body_fat_pct",
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
    # Environment
    "audio_exposure_db",
}

RANGE_TO_DAYS = {"7d": 7, "30d": 30, "90d": 90, "1y": 365}


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
                CAST(day AS text) AS date,
                avg_value,
                min_value,
                max_value,
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
    rows = result.fetchall()

    return {
        "metric": metric,
        "range": range,
        "series": [
            {
                "date":        r.date,
                "avg":         r.avg_value,
                "min":         r.min_value,
                "max":         r.max_value,
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
