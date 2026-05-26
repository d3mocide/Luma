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
    today_dt = date.today()
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
    from datetime import datetime, timezone
    yesterday_start = datetime.combine(yesterday_dt, datetime.min.time()).replace(tzinfo=timezone.utc)
    yesterday_end = datetime.combine(today_dt, datetime.min.time()).replace(tzinfo=timezone.utc)
    
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
    
    logged_cal = 0.0
    logged_sat = 0.0
    logged_sol = 0.0
    for e in events:
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
        "date": today_dt.isoformat(),
        "weight": {
            "latest_kg": latest.get("weight_kg"),
            "trend_7d": weight_7d,
            "trend_28d": weight_28d,
            "target_kg": float(goal.target_weight_kg) if goal and goal.target_weight_kg else None,
        },
        "adherence_yesterday": {
            "calories":         {"logged": logged_cal, "target": target_cal, "pct": cal_pct},
            "sat_fat_g":        {"logged": logged_sat, "target": target_sat, "pct": sat_pct},
            "soluble_fiber_g":  {"logged": logged_sol, "target": target_sol, "pct": sol_pct},
        },
        "biometrics_latest": {
            "hrv_ms":              latest.get("hrv_ms"),
            "rhr_bpm":             latest.get("rhr_bpm"),
            "sleep_score":         latest.get("sleep_score"),
            "sleep_duration_min":  latest.get("sleep_duration_min"),
        },
        "plan_today": [
            {
                "id": str(s.id),
                "slot": s.slot,
                "custom_name": s.custom_name,
                "notes": s.notes,
                "recipe_id": str(s.recipe_id) if s.recipe_id else None
            }
            for s in slots_today
        ],
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
