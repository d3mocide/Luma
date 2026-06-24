import logging
from datetime import UTC, date, datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select, text

from luma.config import settings
from luma.deps import CurrentUser, DbDep
from luma.services.streak import score_day
from luma.services.today_metrics import (
    build_recent_meals,
    compute_daily_totals,
    compute_streak,
    fetch_biometrics_latest,
)

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/today")
async def get_today(
    user: CurrentUser,
    db: DbDep,
    tz: str = Query(default=None, alias="tz"),
) -> dict[str, Any]:
    # SERVER_TIMEZONE is the single source of truth for calendar-day boundaries
    # (streaks, "today" totals). The client tz hint is intentionally ignored so
    # the day never drifts with the device clock — see SERVER_TIMEZONE in .env.
    resolved_tz = ZoneInfo(settings.server_timezone)
    today_dt = datetime.now(resolved_tz).date()

    # 1. Fetch user's goals
    from luma.db.models import Goal, MealEvent, MealPlan, MealPlanSlot
    stmt_goal = select(Goal).where(Goal.user_id == user.id)
    res_goal = await db.execute(stmt_goal)
    goal = res_goal.scalar_one_or_none()

    target_cal = goal.daily_calorie_target if goal else None
    target_sat = float(goal.daily_sat_fat_g_max) if goal and goal.daily_sat_fat_g_max else None
    target_sol = float(goal.daily_soluble_fiber_g) if goal and goal.daily_soluble_fiber_g else None
    target_sodium = float(goal.daily_sodium_mg_max) if goal and goal.daily_sodium_mg_max else None
    target_protein = float(goal.daily_protein_g_min) if goal and goal.daily_protein_g_min else None

    # All boundaries are computed in the configured local timezone then converted
    # to UTC so queries align with the user's calendar day, not the server clock.
    yesterday_end = datetime.combine(today_dt, time.min, tzinfo=resolved_tz).astimezone(UTC)
    today_start = yesterday_end
    today_end = datetime.combine(today_dt + timedelta(days=1), time.min, tzinfo=resolved_tz).astimezone(UTC)

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

    logged, supplement_nutrients = await compute_daily_totals(
        db, str(user.id), list(today_events), today_start, today_end
    )
    logged_cal = logged["cal"]
    logged_sat = logged["sat"]
    logged_sol = logged["sol"]
    logged_sodium = logged["sodium"]
    logged_protein = logged["protein"]

    cal_pct = round((logged_cal / target_cal) * 100, 1) if target_cal else None
    sat_pct = round((logged_sat / target_sat) * 100, 1) if target_sat else None
    sol_pct = round((logged_sol / target_sol) * 100, 1) if target_sol else None
    sodium_pct = round((logged_sodium / target_sodium) * 100, 1) if target_sodium else None
    protein_pct = round((logged_protein / target_protein) * 100, 1) if target_protein else None
    
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

    recent_meals = build_recent_meals(list(today_events))

    # Latest point-in-time biometrics (HRV, RHR, sleep, weight, …) plus today's
    # summed cumulative activity (steps, active kcal, …).
    latest = await fetch_biometrics_latest(db, str(user.id), today_start, today_end)

    # Streak: consecutive days the user stayed "on track" (hit their daily
    # targets). This headline number and /today/streak-history both grade each
    # day through score_day() so they can never disagree — the old logic counted
    # any day with a meal logged, which contradicted the per-day breakdown.
    streak_targets: dict[str, float | None] = {
        "cal": float(target_cal) if target_cal else None,
        "sat": target_sat,
        "fib": target_sol,
        "sod": target_sodium,
    }
    streak_days = await compute_streak(
        db, str(user.id), today_dt, resolved_tz, streak_targets, today_end
    )

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
            "calories":         {"logged": logged_cal,     "target": target_cal,     "pct": cal_pct},
            "sat_fat_g":        {"logged": logged_sat,     "target": target_sat,     "pct": sat_pct},
            "soluble_fiber_g":  {"logged": logged_sol,     "target": target_sol,     "pct": sol_pct},
            "sodium_mg":        {"logged": logged_sodium,  "target": target_sodium,  "pct": sodium_pct},
            "protein_g":        {"logged": logged_protein, "target": target_protein, "pct": protein_pct},
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
        "supplement_nutrients": supplement_nutrients,
        "active_insight": await _get_active_insight(db, str(user.id)),
    }


@router.get("/today/streak-history")
async def get_streak_history(
    user: CurrentUser,
    db: DbDep,
    tz: str = Query(default=None, alias="tz"),
) -> list[dict[str, Any]]:
    # SERVER_TIMEZONE is authoritative; the client tz hint is ignored so the
    # per-day breakdown lines up with the headline streak in /today.
    resolved_tz = ZoneInfo(settings.server_timezone)

    today_dt = datetime.now(resolved_tz).date()
    start_dt = today_dt - timedelta(days=29)

    from luma.db.models import Goal, Supplement, SupplementLog

    res_goal = await db.execute(select(Goal).where(Goal.user_id == user.id))
    goal = res_goal.scalar_one_or_none()

    target_cal = float(goal.daily_calorie_target) if goal and goal.daily_calorie_target else None
    target_sat = float(goal.daily_sat_fat_g_max) if goal and goal.daily_sat_fat_g_max else None
    target_sol = float(goal.daily_soluble_fiber_g) if goal and goal.daily_soluble_fiber_g else None
    target_sod = float(goal.daily_sodium_mg_max) if goal and goal.daily_sodium_mg_max else None

    start_utc = datetime.combine(start_dt, time.min, tzinfo=resolved_tz).astimezone(UTC)
    end_utc   = datetime.combine(today_dt + timedelta(days=1), time.min, tzinfo=resolved_tz).astimezone(UTC)
    tz_key = resolved_tz.key if hasattr(resolved_tz, "key") else settings.server_timezone

    # Supplement contributions are credited only to the days the user actually
    # logged taking them — not blanket-applied to every day in the window.
    supp_log_rows = await db.execute(
        select(SupplementLog.ts, Supplement.nutrients_per_dose)
        .join(Supplement, SupplementLog.supplement_id == Supplement.id)
        .where(
            Supplement.user_id == user.id,
            Supplement.is_active.is_(True),
            SupplementLog.ts >= start_utc,
            SupplementLog.ts < end_utc,
        )
    )
    supp_by_day: dict[date, dict[str, float]] = {}
    for log_ts, nutrients in supp_log_rows:
        day = log_ts.astimezone(resolved_tz).date()
        bucket = supp_by_day.setdefault(day, {"cal": 0.0, "sat": 0.0, "sol": 0.0, "sod": 0.0})
        for key, val in (nutrients or {}).items():
            v = float(val or 0.0)
            if key == "calories":
                bucket["cal"] += v
            elif key == "saturated_fat_g":
                bucket["sat"] += v
            elif key == "soluble_fiber_g":
                bucket["sol"] += v
            elif key == "sodium_mg":
                bucket["sod"] += v

    meal_rows = await db.execute(
        text("""
            SELECT
                DATE(ts AT TIME ZONE :tz) AS day,
                COALESCE(SUM(CAST(NULLIF(nutrition->>'calories', '') AS numeric)), 0)        AS cal,
                COALESCE(SUM(CAST(NULLIF(nutrition->>'saturated_fat_g', '') AS numeric)), 0)  AS sat,
                COALESCE(SUM(CAST(NULLIF(nutrition->>'soluble_fiber_g', '') AS numeric)), 0)  AS sol,
                COALESCE(SUM(CAST(NULLIF(nutrition->>'sodium_mg', '') AS numeric)), 0)        AS sod
            FROM meal_events
            WHERE user_id = :user_id
              AND ts >= :start_utc
              AND ts < :end_utc
              AND nutrition IS NOT NULL
            GROUP BY day
        """),
        {"user_id": str(user.id), "tz": tz_key, "start_utc": start_utc, "end_utc": end_utc},
    )

    daily_map: dict = {}
    for row in meal_rows:
        supp = supp_by_day.get(row.day, {"cal": 0.0, "sat": 0.0, "sol": 0.0, "sod": 0.0})
        daily_map[row.day] = {
            "cal": float(row.cal) + supp["cal"],
            "sat": float(row.sat) + supp["sat"],
            "sol": float(row.sol) + supp["sol"],
            "sod": float(row.sod) + supp["sod"],
        }

    # Days where the user logged only supplements (no meals) still count.
    for day, supp in supp_by_day.items():
        if day not in daily_map:
            daily_map[day] = {
                "cal": supp["cal"],
                "sat": supp["sat"],
                "sol": supp["sol"],
                "sod": supp["sod"],
            }

    hist_targets: dict[str, float | None] = {
        "cal": target_cal, "sat": target_sat, "fib": target_sol, "sod": target_sod,
    }
    configured = sum(1 for v in hist_targets.values() if v is not None)

    result: list[dict[str, Any]] = []
    for i in range(30):
        d = start_dt + timedelta(days=i)
        day_data = daily_map.get(d)

        if day_data is None:
            result.append({
                "date": d.isoformat(),
                "cal_logged": None, "cal_target": target_cal,
                "sat_logged": None, "sat_target": target_sat,
                "fib_logged": None, "fib_target": target_sol,
                "sod_logged": None, "sod_target": target_sod,
                "targets_met": 0,
                "targets_possible": configured,
                "on_track": False,
                "logged_anything": False,
            })
            continue

        score = score_day(
            {"cal": day_data["cal"], "sat": day_data["sat"], "fib": day_data["sol"], "sod": day_data["sod"]},
            hist_targets,
        )

        result.append({
            "date": d.isoformat(),
            "cal_logged": day_data["cal"], "cal_target": target_cal,
            "sat_logged": day_data["sat"], "sat_target": target_sat,
            "fib_logged": day_data["sol"], "fib_target": target_sol,
            "sod_logged": day_data["sod"], "sod_target": target_sod,
            "targets_met": score["targets_met"],
            "targets_possible": score["targets_possible"],
            "on_track": score["on_track"],
            "logged_anything": True,
        })

    return result


def _serialize_meal_event(event) -> dict[str, Any]:
    """Shape a MealEvent for the client meal list — mirrors the inline builder in
    get_today's recent_meals so the Nutrition Day page renders day history with
    the same headline/macro fields the Today screen uses."""
    items = event.items if isinstance(event.items, list) else []
    first_item = items[0].get("name") if items and isinstance(items[0], dict) else None
    nutrition = event.nutrition if isinstance(event.nutrition, dict) else {}
    raw = event.raw_input or ""
    if event.source in ("favorite", "favorites") and raw:
        headline = raw
    elif event.source == "plan" and raw.startswith("Planned: "):
        headline = raw[len("Planned: "):]
    else:
        headline = first_item or "Logged meal"
    return {
        "id": str(event.id),
        "ts": event.ts.isoformat(),
        "slot": event.slot,
        "source": event.source,
        "item_count": len(items),
        "calories": float(nutrition.get("calories") or 0.0),
        "headline": headline,
        "nutrition": nutrition,
        "items": items,
        "raw_input": event.raw_input,
    }


@router.get("/today/nutrition-history")
async def get_nutrition_history(
    user: CurrentUser,
    db: DbDep,
    days: int = Query(default=90, ge=1, le=365),
) -> dict[str, Any]:
    """Per-day summed nutrition over a trailing window, for the Nutrition Day page.

    Unlike /today/streak-history (four ring metrics only), this sums EVERY
    nutrient key — macros and micros — so the page can render the protein ring,
    the full nutrient breakdown, and per-nutrient trends for any past day.
    """
    resolved_tz = ZoneInfo(settings.server_timezone)
    today_dt = datetime.now(resolved_tz).date()
    start_dt = today_dt - timedelta(days=days - 1)

    from luma.db.models import Goal, MealEvent, Supplement, SupplementLog

    res_goal = await db.execute(select(Goal).where(Goal.user_id == user.id))
    goal = res_goal.scalar_one_or_none()

    targets = {
        "calories":        float(goal.daily_calorie_target) if goal and goal.daily_calorie_target else None,
        "saturated_fat_g": float(goal.daily_sat_fat_g_max) if goal and goal.daily_sat_fat_g_max else None,
        "soluble_fiber_g": float(goal.daily_soluble_fiber_g) if goal and goal.daily_soluble_fiber_g else None,
        "sodium_mg":       float(goal.daily_sodium_mg_max) if goal and goal.daily_sodium_mg_max else None,
        "protein_g":       float(goal.daily_protein_g_min) if goal and goal.daily_protein_g_min else None,
    }

    start_utc = datetime.combine(start_dt, time.min, tzinfo=resolved_tz).astimezone(UTC)
    end_utc = datetime.combine(today_dt + timedelta(days=1), time.min, tzinfo=resolved_tz).astimezone(UTC)

    # Sum every nutrient key per calendar day in Python rather than SQL: nutrition
    # is a free-form JSON map and we want all of it (micros included), not just the
    # four streak columns the SQL aggregate in streak-history extracts.
    event_rows = await db.execute(
        select(MealEvent.ts, MealEvent.nutrition).where(
            MealEvent.user_id == user.id,
            MealEvent.ts >= start_utc,
            MealEvent.ts < end_utc,
            MealEvent.nutrition.isnot(None),
        )
    )
    daily: dict[date, dict[str, float]] = {}
    for ts, nutrition in event_rows:
        if not isinstance(nutrition, dict):
            continue
        day = ts.astimezone(resolved_tz).date()
        bucket = daily.setdefault(day, {})
        for key, val in nutrition.items():
            try:
                bucket[key] = bucket.get(key, 0.0) + float(val or 0.0)
            except (TypeError, ValueError):
                continue

    # Logged supplements are credited to the day they were taken — same gate as
    # the Today totals so the two views agree.
    supp_rows = await db.execute(
        select(SupplementLog.ts, Supplement.nutrients_per_dose)
        .join(Supplement, SupplementLog.supplement_id == Supplement.id)
        .where(
            Supplement.user_id == user.id,
            Supplement.is_active.is_(True),
            SupplementLog.ts >= start_utc,
            SupplementLog.ts < end_utc,
        )
    )
    for ts, nutrients in supp_rows:
        day = ts.astimezone(resolved_tz).date()
        bucket = daily.setdefault(day, {})
        for key, val in (nutrients or {}).items():
            try:
                bucket[key] = bucket.get(key, 0.0) + float(val or 0.0)
            except (TypeError, ValueError):
                continue

    out_days: list[dict[str, Any]] = []
    for i in range(days):
        d = start_dt + timedelta(days=i)
        day_bucket = daily.get(d)
        out_days.append({
            "date": d.isoformat(),
            "nutrition": day_bucket or {},
            "logged_anything": day_bucket is not None,
        })

    return {"targets": targets, "days": out_days}


@router.get("/today/day/{day}")
async def get_day_detail(
    day: str,
    user: CurrentUser,
    db: DbDep,
) -> dict[str, Any]:
    """All meals logged on a given calendar day (server timezone), newest first.

    Powers the Summary tab's meal list on the Nutrition Day page. Unlike
    /today's recent_meals (capped at six), this returns the full day so history
    days show every meal."""
    resolved_tz = ZoneInfo(settings.server_timezone)
    try:
        target_day = date.fromisoformat(day)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="Invalid date") from exc

    from luma.db.models import MealEvent

    day_start = datetime.combine(target_day, time.min, tzinfo=resolved_tz).astimezone(UTC)
    day_end = datetime.combine(target_day + timedelta(days=1), time.min, tzinfo=resolved_tz).astimezone(UTC)

    rows = await db.execute(
        select(MealEvent)
        .where(
            MealEvent.user_id == user.id,
            MealEvent.ts >= day_start,
            MealEvent.ts < day_end,
        )
        .order_by(MealEvent.ts.desc())
    )
    events = rows.scalars().all()
    return {
        "date": target_day.isoformat(),
        "meals": [_serialize_meal_event(e) for e in events],
    }


async def _get_active_insight(db, user_id: str) -> dict | None:
    import json as _json
    import time as _time

    # Prefer alerts from the past 24 h so the Today widget always surfaces recent
    # content. Only fall through to older open alerts when nothing recent exists.
    recent_rows = await db.execute(
        text("""
            SELECT id, rule_id, severity, payload, narrative
            FROM alerts
            WHERE user_id = :uid AND status = 'open' AND narrative IS NOT NULL
              AND rule_id != 'motivational_nudge'
              AND ts >= now() - INTERVAL '24 hours'
            ORDER BY ts DESC LIMIT 3
        """),
        {"uid": user_id},
    )
    pool = recent_rows.fetchall()

    if not pool:
        # No recent alerts — use the 3 most recent open alerts regardless of age.
        older_rows = await db.execute(
            text("""
                SELECT id, rule_id, severity, payload, narrative
                FROM alerts
                WHERE user_id = :uid AND status = 'open' AND narrative IS NOT NULL
                  AND rule_id != 'motivational_nudge'
                ORDER BY ts DESC LIMIT 3
            """),
            {"uid": user_id},
        )
        pool = older_rows.fetchall()

    if not pool:
        # Fall back to the most recent motivational nudge.
        nudge_row = await db.execute(
            text("""
                SELECT id, rule_id, severity, payload, narrative
                FROM alerts
                WHERE user_id = :uid AND status = 'open' AND narrative IS NOT NULL
                  AND rule_id = 'motivational_nudge'
                ORDER BY ts DESC LIMIT 1
            """),
            {"uid": user_id},
        )
        nudge = nudge_row.fetchone()
        if nudge:
            pool = [nudge]

    if not pool:
        return None

    # Rotate through the pool every 4 hours so multiple same-day insights each
    # get airtime on the Today screen.
    idx = int(_time.time() // (4 * 3600)) % len(pool)
    r = pool[idx]

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
