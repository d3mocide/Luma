import logging
from datetime import date, timedelta
from typing import Any

from fastapi import APIRouter
from sqlalchemy import select, text

from luma.deps import CurrentUser, DbDep

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/today")
async def get_today(user: CurrentUser, db: DbDep) -> dict[str, Any]:
    today = date.today()

    # Fetch latest biometrics
    biometric_rows = await db.execute(
        text("""
            SELECT DISTINCT ON (metric)
                metric, value, ts
            FROM biometrics
            WHERE user_id = :user_id
            ORDER BY metric, ts DESC
        """),
        {"user_id": str(user.id)},
    )
    latest: dict[str, float] = {}
    for row in biometric_rows:
        latest[row.metric] = row.value

    # Fetch 7-day and 28-day weight slopes (simple linear regression on daily averages)
    weight_7d = await _weight_slope(db, str(user.id), 7)
    weight_28d = await _weight_slope(db, str(user.id), 28)

    return {
        "date": today.isoformat(),
        "weight": {
            "latest_kg": latest.get("weight_kg"),
            "trend_7d": weight_7d,
            "trend_28d": weight_28d,
            "target_kg": None,
        },
        "adherence_yesterday": {
            "calories":         {"logged": None, "target": None, "pct": None},
            "sat_fat_g":        {"logged": None, "target": None, "pct": None},
            "soluble_fiber_g":  {"logged": None, "target": None, "pct": None},
        },
        "biometrics_latest": {
            "hrv_ms":              latest.get("hrv_ms"),
            "rhr_bpm":             latest.get("rhr_bpm"),
            "sleep_score":         latest.get("sleep_score"),
            "sleep_duration_min":  latest.get("sleep_duration_min"),
        },
        "plan_today": [],
        "active_insight": None,
    }


async def _weight_slope(db, user_id: str, days: int) -> float | None:
    result = await db.execute(
        text("""
            SELECT
                extract(epoch from day)::double precision AS x,
                last_value AS y
            FROM biometrics_daily
            WHERE user_id = :user_id
              AND metric = 'weight_kg'
              AND day >= now() - (:days * INTERVAL '1 day')
            ORDER BY day
        """),
        {"user_id": user_id, "days": days},
    )
    rows = result.fetchall()
    if len(rows) < 2:
        return None

    xs = [r.x for r in rows]
    ys = [r.y for r in rows]
    n = len(xs)
    mx, my = sum(xs) / n, sum(ys) / n
    num = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    den = sum((x - mx) ** 2 for x in xs)
    if den == 0:
        return 0.0
    # slope is kg/second → convert to kg/week
    return round(num / den * 86400 * 7, 3)
