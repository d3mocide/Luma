"""Alert rule definitions — Phase 2."""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import NamedTuple

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


class AlertResult(NamedTuple):
    rule_id: str
    severity: str
    payload: dict


async def check_sat_fat_rolling(user_id: str, db: AsyncSession) -> AlertResult | None:
    """7-day rolling average saturated fat >10% over user target."""
    row = await db.execute(
        text("""
            SELECT
                g.daily_sat_fat_g_max::float AS target,
                AVG((nutrition->>'saturated_fat_g')::float) AS avg_sat
            FROM goals g,
                 meal_events me
            WHERE g.user_id = :uid
              AND me.user_id = :uid
              AND g.daily_sat_fat_g_max IS NOT NULL
              AND me.ts >= now() - INTERVAL '7 days'
              AND me.nutrition->>'saturated_fat_g' IS NOT NULL
            GROUP BY g.daily_sat_fat_g_max
        """),
        {"uid": user_id},
    )
    r = row.fetchone()
    if not r or r.target is None or r.avg_sat is None:
        return None
    if r.avg_sat > r.target * 1.10:
        return AlertResult(
            rule_id="sat_fat_rolling",
            severity="warning",
            payload={"avg_7d_g": round(r.avg_sat, 1), "target_g": round(r.target, 1)},
        )
    return None


async def check_soluble_fiber_rolling(user_id: str, db: AsyncSession) -> AlertResult | None:
    """7-day rolling average soluble fiber <70% of target."""
    row = await db.execute(
        text("""
            SELECT
                g.daily_soluble_fiber_g::float AS target,
                AVG((nutrition->>'soluble_fiber_g')::float) AS avg_fiber
            FROM goals g,
                 meal_events me
            WHERE g.user_id = :uid
              AND me.user_id = :uid
              AND g.daily_soluble_fiber_g IS NOT NULL
              AND me.ts >= now() - INTERVAL '7 days'
              AND me.nutrition->>'soluble_fiber_g' IS NOT NULL
            GROUP BY g.daily_soluble_fiber_g
        """),
        {"uid": user_id},
    )
    r = row.fetchone()
    if not r or r.target is None or r.avg_fiber is None:
        return None
    if r.avg_fiber < r.target * 0.70:
        return AlertResult(
            rule_id="low_fiber_rolling",
            severity="warning",
            payload={"avg_7d_g": round(r.avg_fiber, 1), "target_g": round(r.target, 1)},
        )
    return None


async def check_weight_trend(user_id: str, db: AsyncSession) -> AlertResult | None:
    """Weight trend diverging from goal trajectory."""
    row = await db.execute(
        text("""
            SELECT
                g.target_weight_kg::float AS target,
                regr_slope(b.last_value, extract(epoch from b.day)) * 86400 * 7 AS weekly_slope,
                MAX(b.last_value) AS latest_weight
            FROM goals g
            JOIN biometrics_daily b ON b.user_id = g.user_id AND b.metric = 'weight_kg'
            WHERE g.user_id = :uid
              AND g.target_weight_kg IS NOT NULL
              AND b.day >= now() - INTERVAL '28 days'
            GROUP BY g.target_weight_kg
        """),
        {"uid": user_id},
    )
    r = row.fetchone()
    if not r or r.target is None or r.latest_weight is None or r.weekly_slope is None:
        return None

    going_down = r.target < r.latest_weight
    diverging = (going_down and r.weekly_slope > 0.1) or (not going_down and r.weekly_slope < -0.1)
    if diverging:
        return AlertResult(
            rule_id="weight_trend_diverging",
            severity="warning",
            payload={
                "target_kg": round(r.target, 1),
                "latest_kg": round(r.latest_weight, 1),
                "weekly_slope_kg": round(r.weekly_slope, 3),
            },
        )
    return None


async def check_hrv_anomaly(user_id: str, db: AsyncSession) -> AlertResult | None:
    """HRV drop >15% vs 7-day baseline."""
    row = await db.execute(
        text("""
            SELECT
                AVG(CASE WHEN day < now() - INTERVAL '1 day' THEN avg_value END) AS baseline,
                AVG(CASE WHEN day >= now() - INTERVAL '1 day' THEN avg_value END) AS latest
            FROM biometrics_daily
            WHERE user_id = :uid
              AND metric = 'hrv_ms'
              AND day >= now() - INTERVAL '8 days'
        """),
        {"uid": user_id},
    )
    r = row.fetchone()
    if not r or r.baseline is None or r.latest is None:
        return None
    if r.baseline > 0 and r.latest < r.baseline * 0.85:
        return AlertResult(
            rule_id="hrv_drop",
            severity="info",
            payload={
                "baseline_ms": round(r.baseline, 1),
                "latest_ms": round(r.latest, 1),
                "drop_pct": round((1 - r.latest / r.baseline) * 100, 1),
            },
        )
    return None


async def check_logging_gap(user_id: str, db: AsyncSession) -> AlertResult | None:
    """Logging streak broken after 3+ consecutive days."""
    streak_row = await db.execute(
        text("""
            SELECT COUNT(DISTINCT DATE(ts AT TIME ZONE 'UTC')) AS days_logged
            FROM meal_events
            WHERE user_id = :uid AND ts >= now() - INTERVAL '10 days'
        """),
        {"uid": user_id},
    )
    last_row = await db.execute(
        text("""
            SELECT MAX(DATE(ts AT TIME ZONE 'UTC')) AS last_day
            FROM meal_events WHERE user_id = :uid
        """),
        {"uid": user_id},
    )
    sr = streak_row.fetchone()
    lr = last_row.fetchone()
    if not sr or not lr or lr.last_day is None:
        return None

    today = datetime.now(timezone.utc).date()
    days_since = (today - lr.last_day).days
    if sr.days_logged >= 3 and days_since >= 1:
        return AlertResult(
            rule_id="logging_streak_broken",
            severity="info",
            payload={"days_since_last_log": days_since, "prior_streak_days": sr.days_logged},
        )
    return None


async def check_calorie_deficit(user_id: str, db: AsyncSession) -> AlertResult | None:
    """7-day average calorie deficit >500 kcal/day vs target."""
    row = await db.execute(
        text("""
            SELECT
                g.daily_calorie_target::float AS target,
                AVG(daily.cal) AS avg_logged
            FROM goals g
            JOIN LATERAL (
                SELECT SUM((nutrition->>'calories')::float) AS cal
                FROM meal_events
                WHERE user_id = :uid
                  AND ts >= now() - INTERVAL '7 days'
                GROUP BY DATE(ts AT TIME ZONE 'UTC')
            ) daily ON TRUE
            WHERE g.user_id = :uid AND g.daily_calorie_target IS NOT NULL
            GROUP BY g.daily_calorie_target
        """),
        {"uid": user_id},
    )
    r = row.fetchone()
    if not r or r.target is None or r.avg_logged is None or r.avg_logged == 0:
        return None
    deficit = r.target - r.avg_logged
    if deficit > 500:
        return AlertResult(
            rule_id="aggressive_deficit",
            severity="warning",
            payload={
                "avg_logged_kcal": round(r.avg_logged, 0),
                "target_kcal": round(r.target, 0),
                "avg_deficit_kcal": round(deficit, 0),
            },
        )
    return None


async def check_ldl_risk_day(user_id: str, db: AsyncSession) -> AlertResult | None:
    """Yesterday: high sat fat AND low fiber — LDL risk pattern."""
    row = await db.execute(
        text("""
            SELECT
                SUM((me.nutrition->>'saturated_fat_g')::float) AS sat_fat,
                SUM((me.nutrition->>'soluble_fiber_g')::float) AS fiber,
                g.daily_sat_fat_g_max::float AS sat_target,
                g.daily_soluble_fiber_g::float AS fiber_target
            FROM meal_events me
            JOIN goals g ON g.user_id = me.user_id
            WHERE me.user_id = :uid
              AND DATE(me.ts AT TIME ZONE 'UTC') = CURRENT_DATE - 1
            GROUP BY g.daily_sat_fat_g_max, g.daily_soluble_fiber_g
        """),
        {"uid": user_id},
    )
    r = row.fetchone()
    if not r or r.sat_fat is None or r.fiber is None:
        return None
    high_sat = r.sat_target and r.sat_fat > r.sat_target * 1.25
    low_fiber = r.fiber_target and r.fiber < r.fiber_target * 0.50
    if high_sat and low_fiber:
        return AlertResult(
            rule_id="ldl_risk_day",
            severity="warning",
            payload={
                "sat_fat_g": round(r.sat_fat, 1),
                "fiber_g": round(r.fiber, 1),
                "sat_target_g": round(r.sat_target, 1) if r.sat_target else None,
                "fiber_target_g": round(r.fiber_target, 1) if r.fiber_target else None,
            },
        )
    return None


async def check_positive_milestone(user_id: str, db: AsyncSession) -> AlertResult | None:
    """7-day logging streak or within 1 kg of target weight."""
    streak_row = await db.execute(
        text("""
            SELECT COUNT(DISTINCT DATE(ts AT TIME ZONE 'UTC')) AS streak
            FROM meal_events
            WHERE user_id = :uid AND ts >= now() - INTERVAL '7 days'
        """),
        {"uid": user_id},
    )
    sr = streak_row.fetchone()
    if sr and sr.streak == 7:
        return AlertResult(
            rule_id="positive_milestone",
            severity="positive",
            payload={"milestone": "7_day_streak", "streak_days": 7},
        )

    weight_row = await db.execute(
        text("""
            SELECT
                g.target_weight_kg::float AS target,
                MAX(b.last_value) AS latest
            FROM goals g
            JOIN biometrics_daily b ON b.user_id = g.user_id AND b.metric = 'weight_kg'
            WHERE g.user_id = :uid AND g.target_weight_kg IS NOT NULL
              AND b.day >= now() - INTERVAL '7 days'
            GROUP BY g.target_weight_kg
        """),
        {"uid": user_id},
    )
    wr = weight_row.fetchone()
    if wr and wr.target and wr.latest and abs(wr.latest - wr.target) <= 1.0:
        return AlertResult(
            rule_id="positive_milestone",
            severity="positive",
            payload={"milestone": "near_target_weight", "current_kg": round(wr.latest, 1), "target_kg": round(wr.target, 1)},
        )
    return None


async def check_sodium_potassium_ratio(user_id: str, db: AsyncSession) -> AlertResult | None:
    """Rolling 7-day Na:K ratio > 1.0 — unfavorable for cardiovascular risk.

    A ratio above 1.0 (mg:mg) is associated with elevated blood pressure risk.
    Requires potassium_mg to be logged; skips users without sufficient data.
    """
    row = await db.execute(
        text("""
            SELECT
                SUM((nutrition->>'sodium_mg')::float)    AS total_sodium,
                SUM((nutrition->>'potassium_mg')::float) AS total_potassium
            FROM meal_events
            WHERE user_id = :uid
              AND ts >= now() - INTERVAL '7 days'
              AND nutrition->>'potassium_mg' IS NOT NULL
              AND (nutrition->>'potassium_mg')::float > 0
        """),
        {"uid": user_id},
    )
    r = row.fetchone()
    if not r or r.total_sodium is None or r.total_potassium is None or r.total_potassium == 0:
        return None
    ratio = r.total_sodium / r.total_potassium
    if ratio > 1.0:
        return AlertResult(
            rule_id="high_sodium_potassium_ratio",
            severity="warning",
            payload={
                "ratio_7d": round(ratio, 2),
                "total_sodium_mg": round(r.total_sodium, 0),
                "total_potassium_mg": round(r.total_potassium, 0),
            },
        )
    return None


ALL_RULES = [
    check_sat_fat_rolling,
    check_soluble_fiber_rolling,
    check_weight_trend,
    check_hrv_anomaly,
    check_logging_gap,
    check_calorie_deficit,
    check_ldl_risk_day,
    check_sodium_potassium_ratio,
    check_positive_milestone,
]
