import logging
from datetime import timedelta, datetime, timezone, time
from typing import Any
from zoneinfo import ZoneInfo

from fastapi import APIRouter
from sqlalchemy import select, text

from luma.config import settings
from luma.deps import CurrentUser, DbDep

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/today")
async def get_today(user: CurrentUser, db: DbDep) -> dict[str, Any]:
    tz = ZoneInfo(settings.server_timezone)
    today_dt = datetime.now(tz).date()
    yesterday_dt = today_dt - timedelta(days=1)

    # 1. Fetch user's goals
    from luma.db.models import Goal, MealEvent, MealPlan, MealPlanSlot
    stmt_goal = select(Goal).where(Goal.user_id == user.id)
    res_goal = await db.execute(stmt_goal)
    goal = res_goal.scalar_one_or_none()

    target_cal = goal.daily_calorie_target if goal else None
    target_sat = float(goal.daily_sat_fat_g_max) if goal and goal.daily_sat_fat_g_max else None
    target_sol = float(goal.daily_soluble_fiber_g) if goal and goal.daily_soluble_fiber_g else None

    # 2. Fetch yesterday's meal events
    # All boundaries are computed in the configured local timezone then converted
    # to UTC so queries align with the user's calendar day, not the server clock.
    yesterday_start = datetime.combine(yesterday_dt, time.min, tzinfo=tz).astimezone(timezone.utc)
    yesterday_end = datetime.combine(today_dt, time.min, tzinfo=tz).astimezone(timezone.utc)
    today_start = yesterday_end
    today_end = datetime.combine(today_dt + timedelta(days=1), time.min, tzinfo=tz).astimezone(timezone.utc)
    
    stmt_events = (
        select(MealEvent)
        .where(
            MealEvent.user_id == user.id,
            MealEvent.ts >= yesterday_start,
            MealEvent.ts < yesterday_end
        )
    )
    res_events = await db.execute(stmt_events)
    events = res_events.scalars().all()

    stmt_today_events = (
        select(MealEvent)
        .where(
            MealEvent.user_id == user.id,
            MealEvent.ts >= today_start,
            MealEvent.ts < today_end,
        )
        .order_by(MealEvent.ts.desc())
    )
    res_today_events = await db.execute(stmt_today_events)
    today_events = res_today_events.scalars().all()
    
    logged_cal = 0.0
    logged_sat = 0.0
    logged_sol = 0.0
    for e in today_events:
        nutr = e.nutrition or {}
        logged_cal += float(nutr.get("calories") or 0.0)
        logged_sat += float(nutr.get("saturated_fat_g") or 0.0)
        logged_sol += float(nutr.get("soluble_fiber_g") or 0.0)
        
    cal_pct = round((logged_cal / target_cal) * 100, 1) if target_cal else None
    sat_pct = round((logged_sat / target_sat) * 100, 1) if target_sat else None
    sol_pct = round((logged_sol / target_sol) * 100, 1) if target_sol else None
    
    # 3. Fetch today's meal plan slots
    stmt_plan = (
        select(MealPlanSlot)
        .join(MealPlan)
        .where(
            MealPlan.user_id == user.id,
            MealPlan.status == "active",
            MealPlanSlot.slot_date == today_dt
        )
        .order_by(MealPlanSlot.slot)
    )
    res_plan = await db.execute(stmt_plan)
    slots_today = res_plan.scalars().all()

    logged_plan_slot_ids = {str(e.plan_slot_id) for e in today_events if e.plan_slot_id}

    recent_meals = []
    for event in today_events[:6]:
        items = event.items if isinstance(event.items, list) else []
        first_item = items[0].get("name") if items and isinstance(items[0], dict) else None
        nutrition = event.nutrition if isinstance(event.nutrition, dict) else {}
        recent_meals.append(
            {
                "id": str(event.id),
                "ts": event.ts.isoformat(),
                "slot": event.slot,
                "source": event.source,
                "item_count": len(items),
                "calories": float(nutrition.get("calories") or 0.0),
                "headline": first_item or "Logged meal",
            }
        )

    # Cumulative activity metrics must be summed for today rather than
    # latest-wins, because HAE sends many small interval readings throughout
    # the day (e.g. 1 step per recent sample) and the newest row is never
    # the day's running total.
    _CUMULATIVE = (
        "steps", "active_kcal", "exercise_min",
        "stand_min", "stand_hours", "flights_climbed", "distance_mi",
    )

    # Fetch latest point-in-time biometrics (HRV, RHR, sleep, weight, …)
    biometric_rows = await db.execute(
        text("""
            SELECT DISTINCT ON (metric)
                metric, value, ts
            FROM biometrics
            WHERE user_id = :user_id
              AND metric != ALL(:cumulative)
            ORDER BY metric, ts DESC
        """),
        {"user_id": str(user.id), "cumulative": list(_CUMULATIVE)},
    )
    latest: dict[str, float] = {}
    for row in biometric_rows:
        latest[row.metric] = row.value

    # Fetch today's cumulative activity metrics (sum all readings for today)
    cumulative_rows = await db.execute(
        text("""
            SELECT metric, SUM(value) AS value
            FROM biometrics
            WHERE user_id = :user_id
              AND metric = ANY(:cumulative)
              AND ts >= :today_start
              AND ts < :today_end
            GROUP BY metric
        """),
        {
            "user_id": str(user.id),
            "cumulative": list(_CUMULATIVE),
            "today_start": today_start,
            "today_end": today_end,
        },
    )
    for row in cumulative_rows:
        latest[row.metric] = row.value

    # Streak: consecutive days (server timezone) where at least one meal was logged
    streak_rows = await db.execute(
        text("""
            SELECT DISTINCT DATE(ts AT TIME ZONE :tz) AS day
            FROM meal_events
            WHERE user_id = :user_id
              AND ts >= NOW() - INTERVAL '365 days'
            ORDER BY day DESC
        """),
        {"user_id": str(user.id), "tz": settings.server_timezone},
    )
    days_set = {row.day for row in streak_rows}
    # Start from today; fall back to yesterday before midnight resets the streak
    _start = today_dt if today_dt in days_set else today_dt - timedelta(days=1)
    streak_days = 0
    _check = _start
    while _check in days_set:
        streak_days += 1
        _check -= timedelta(days=1)

    # Fetch 7-day and 28-day weight slopes (simple linear regression on daily averages)
    weight_7d = await _weight_slope(db, str(user.id), 7)
    weight_28d = await _weight_slope(db, str(user.id), 28)

    return {
        "date": today_dt.isoformat(),
        "weight": {
            "latest_kg": latest.get("weight_kg"),
            "trend_7d": weight_7d,
            "trend_28d": weight_28d,
            "target_kg": float(goal.target_weight_kg) if goal and goal.target_weight_kg else None,
        },
        "adherence_today": {
            "calories":         {"logged": logged_cal, "target": target_cal, "pct": cal_pct},
            "sat_fat_g":        {"logged": logged_sat, "target": target_sat, "pct": sat_pct},
            "soluble_fiber_g":  {"logged": logged_sol, "target": target_sol, "pct": sol_pct},
        },
        "biometrics_latest": {
            "hrv_ms":              latest.get("hrv_ms"),
            "rhr_bpm":             latest.get("rhr_bpm"),
            "heart_rate_avg_bpm":  latest.get("heart_rate_avg_bpm"),
            "sleep_score":         latest.get("sleep_score"),
            "sleep_duration_min":  latest.get("sleep_duration_min"),
            "steps":               latest.get("steps"),
            "active_kcal":         latest.get("active_kcal"),
            "bmr_kcal":            latest.get("bmr_kcal"),
            "exercise_min":        latest.get("exercise_min"),
            "respiratory_rate_bpm": latest.get("respiratory_rate_bpm"),
            "spo2_pct":            latest.get("spo2_pct"),
            "body_temp_c":         latest.get("body_temp_c"),
        },
        "plan_today": [
            {
                "id": str(s.id),
                "plan_id": str(s.plan_id),
                "slot": s.slot,
                "custom_name": s.custom_name,
                "notes": s.notes,
                "recipe_id": str(s.recipe_id) if s.recipe_id else None,
                "logged": str(s.id) in logged_plan_slot_ids,
            }
            for s in slots_today
        ],
        "recent_meals": recent_meals,
        "streak_days": streak_days,
        "active_insight": await _get_active_insight(db, str(user.id)),
    }


async def _get_active_insight(db, user_id: str) -> dict | None:
    import json as _json
    row = await db.execute(
        text("""
            SELECT id, rule_id, severity, payload, narrative
            FROM alerts
            WHERE user_id = :uid AND status = 'open' AND narrative IS NOT NULL
            ORDER BY ts DESC LIMIT 1
        """),
        {"uid": user_id},
    )
    r = row.fetchone()
    if not r:
        return None
    try:
        narrative = _json.loads(r.narrative) if isinstance(r.narrative, str) else r.narrative
    except (TypeError, _json.JSONDecodeError):
        narrative = {}
    return {
        "id": str(r.id),
        "severity": r.severity,
        "headline": narrative.get("headline", ""),
        "cta": narrative.get("body", ""),
        "thread_seed": narrative.get("thread_seed", ""),
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
    rows = [r for r in result.fetchall() if r.y is not None]
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
