"""Alert rule definitions — Phase 2."""
from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta
from typing import NamedTuple
from zoneinfo import ZoneInfo

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from luma.config import settings

logger = logging.getLogger(__name__)


class AlertResult(NamedTuple):
    rule_id: str
    severity: str
    payload: dict
    dedup_hours: int = 24


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
    tz = settings.server_timezone
    streak_row = await db.execute(
        text("""
            SELECT COUNT(DISTINCT DATE(ts AT TIME ZONE :tz)) AS days_logged
            FROM meal_events
            WHERE user_id = :uid AND ts >= now() - INTERVAL '10 days'
        """),
        {"uid": user_id, "tz": tz},
    )
    last_row = await db.execute(
        text("""
            SELECT MAX(DATE(ts AT TIME ZONE :tz)) AS last_day
            FROM meal_events WHERE user_id = :uid
        """),
        {"uid": user_id, "tz": tz},
    )
    sr = streak_row.fetchone()
    lr = last_row.fetchone()
    if not sr or not lr or lr.last_day is None:
        return None

    today = datetime.now(ZoneInfo(tz)).date()
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
                GROUP BY DATE(ts AT TIME ZONE :tz)
            ) daily ON TRUE
            WHERE g.user_id = :uid AND g.daily_calorie_target IS NOT NULL
            GROUP BY g.daily_calorie_target
        """),
        {"uid": user_id, "tz": settings.server_timezone},
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
    tz = settings.server_timezone
    yesterday = (datetime.now(ZoneInfo(tz)) - timedelta(days=1)).date()
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
              AND DATE(me.ts AT TIME ZONE :tz) = :yesterday
            GROUP BY g.daily_sat_fat_g_max, g.daily_soluble_fiber_g
        """),
        {"uid": user_id, "tz": tz, "yesterday": yesterday},
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
            SELECT COUNT(DISTINCT DATE(ts AT TIME ZONE :tz)) AS streak
            FROM meal_events
            WHERE user_id = :uid AND ts >= now() - INTERVAL '7 days'
        """),
        {"uid": user_id, "tz": settings.server_timezone},
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


async def check_motivational_nudge(user_id: str, db: AsyncSession) -> AlertResult | None:
    """Fallback positive insight when no real alerts have fired in the last 24 hours.

    Fires at most twice a day (10-hour dedup). Gathers the user's actual nutrition
    and weight data so the narrator can surface real positives and real negatives
    rather than generic filler.
    """
    real_alerts = await db.execute(
        text("""
            SELECT 1 FROM alerts
            WHERE user_id = :uid
              AND rule_id != 'motivational_nudge'
              AND ts >= now() - INTERVAL '24 hours'
            LIMIT 1
        """),
        {"uid": user_id},
    )
    if real_alerts.fetchone():
        return None

    goals = await db.execute(
        text("""
            SELECT
                daily_calorie_target::float  AS cal_target,
                daily_soluble_fiber_g::float AS fiber_target,
                daily_sat_fat_g_max::float   AS sat_fat_target,
                target_weight_kg::float      AS target_weight_kg
            FROM goals WHERE user_id = :uid LIMIT 1
        """),
        {"uid": user_id},
    )
    g = goals.fetchone()

    nutr = await db.execute(
        text("""
            SELECT
                AVG(daily_cal)   AS avg_cal,
                AVG(daily_fiber) AS avg_fiber,
                AVG(daily_sat)   AS avg_sat,
                COUNT(*)         AS days_logged
            FROM (
                SELECT
                    DATE(ts AT TIME ZONE :tz)                           AS day,
                    SUM((nutrition->>'calories')::float)                AS daily_cal,
                    SUM((nutrition->>'soluble_fiber_g')::float)         AS daily_fiber,
                    SUM((nutrition->>'saturated_fat_g')::float)         AS daily_sat
                FROM meal_events
                WHERE user_id = :uid AND ts >= now() - INTERVAL '7 days'
                GROUP BY DATE(ts AT TIME ZONE :tz)
            ) daily
        """),
        {"uid": user_id, "tz": settings.server_timezone},
    )
    nr = nutr.fetchone()
    if not nr or nr.avg_cal is None:
        return None

    payload: dict = {"streak_days": int(nr.days_logged or 0)}

    if g:
        if g.cal_target and nr.avg_cal:
            payload["cal_adherence_pct"] = round((nr.avg_cal / g.cal_target) * 100, 1)
        if g.fiber_target and nr.avg_fiber:
            payload["fiber_adherence_pct"] = round((nr.avg_fiber / g.fiber_target) * 100, 1)
        if g.sat_fat_target and nr.avg_sat:
            payload["sat_fat_pct_of_target"] = round((nr.avg_sat / g.sat_fat_target) * 100, 1)
        if g.target_weight_kg:
            payload["target_weight_kg"] = round(g.target_weight_kg, 1)

    wt = await db.execute(
        text("""
            SELECT ROUND(
                (regr_slope(last_value, extract(epoch from day)) * 86400 * 7)::numeric, 2
            ) AS slope
            FROM biometrics_daily
            WHERE user_id = :uid AND metric = 'weight_kg'
              AND day >= now() - INTERVAL '14 days'
        """),
        {"uid": user_id},
    )
    wr = wt.fetchone()
    if wr and wr.slope is not None:
        payload["weight_slope_kg_per_week"] = float(wr.slope)

    return AlertResult(
        rule_id="motivational_nudge",
        severity="positive",
        payload=payload,
        dedup_hours=10,
    )


async def check_weight_trend_worsening(user_id: str, db: AsyncSession) -> AlertResult | None:
    """Recent 14-day slope significantly worse than 28-day slope — trend has reversed or stalled after progress."""
    row = await db.execute(
        text("""
            SELECT
                g.target_weight_kg::float AS target,
                MAX(b.last_value) AS latest_weight,
                ROUND(
                    (regr_slope(b.last_value, extract(epoch from b.day)) * 86400 * 7)::numeric, 3
                ) AS slope_28d,
                ROUND(
                    (regr_slope(b.last_value, extract(epoch from b.day))
                     FILTER (WHERE b.day >= now() - INTERVAL '14 days') * 86400 * 7)::numeric, 3
                ) AS slope_14d
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
    if not r or r.target is None or r.latest_weight is None:
        return None
    if r.slope_28d is None or r.slope_14d is None:
        return None

    slope_28d = float(r.slope_28d)
    slope_14d = float(r.slope_14d)

    if abs(r.latest_weight - r.target) < 1.0:
        return None

    losing = r.target < r.latest_weight
    # Fire when the 14d slope has shifted >0.15 kg/wk in the wrong direction vs the 28d slope
    # and the recent slope is itself moving the wrong way.
    if losing:
        worsening = (slope_14d - slope_28d) > 0.15 and slope_14d > 0
    else:
        worsening = (slope_28d - slope_14d) > 0.15 and slope_14d < 0

    if not worsening:
        return None

    return AlertResult(
        rule_id="weight_trend_worsening",
        severity="warning",
        payload={
            "latest_kg": round(r.latest_weight, 1),
            "target_kg": round(r.target, 1),
            "slope_28d_kg_per_week": slope_28d,
            "slope_14d_kg_per_week": slope_14d,
        },
        dedup_hours=168,
    )


async def check_weight_stall(user_id: str, db: AsyncSession) -> AlertResult | None:
    """14-day weight plateau when goal gap is >2 kg — no meaningful movement toward target."""
    row = await db.execute(
        text("""
            SELECT
                g.target_weight_kg::float AS target,
                ROUND(
                    (regr_slope(b.last_value, extract(epoch from b.day)) * 86400 * 7)::numeric, 3
                ) AS weekly_slope,
                MAX(b.last_value) AS latest_weight
            FROM goals g
            JOIN biometrics_daily b ON b.user_id = g.user_id AND b.metric = 'weight_kg'
            WHERE g.user_id = :uid
              AND g.target_weight_kg IS NOT NULL
              AND b.day >= now() - INTERVAL '14 days'
            GROUP BY g.target_weight_kg
        """),
        {"uid": user_id},
    )
    r = row.fetchone()
    if not r or r.target is None or r.latest_weight is None or r.weekly_slope is None:
        return None

    gap = abs(r.latest_weight - r.target)
    stalled = abs(float(r.weekly_slope)) < 0.05 and gap > 2.0
    if not stalled:
        return None

    return AlertResult(
        rule_id="weight_stall",
        severity="warning",
        payload={
            "latest_kg": round(r.latest_weight, 1),
            "target_kg": round(r.target, 1),
            "gap_kg": round(gap, 1),
            "weekly_slope_kg": round(float(r.weekly_slope), 3),
        },
        dedup_hours=168,
    )


async def check_ldl_proxy_stall(user_id: str, db: AsyncSession) -> AlertResult | None:
    """14-day persistent LDL-risk pattern: sat fat and fiber simultaneously off-target for 2 weeks."""
    row = await db.execute(
        text("""
            SELECT
                g.daily_sat_fat_g_max::float   AS sat_target,
                g.daily_soluble_fiber_g::float AS fiber_target,
                AVG((me.nutrition->>'saturated_fat_g')::float)  AS avg_sat,
                AVG((me.nutrition->>'soluble_fiber_g')::float)  AS avg_fiber
            FROM goals g, meal_events me
            WHERE g.user_id = :uid
              AND me.user_id = :uid
              AND g.daily_sat_fat_g_max IS NOT NULL
              AND g.daily_soluble_fiber_g IS NOT NULL
              AND me.ts >= now() - INTERVAL '14 days'
              AND me.nutrition->>'saturated_fat_g' IS NOT NULL
              AND me.nutrition->>'soluble_fiber_g' IS NOT NULL
            GROUP BY g.daily_sat_fat_g_max, g.daily_soluble_fiber_g
        """),
        {"uid": user_id},
    )
    r = row.fetchone()
    if not r or r.sat_target is None or r.fiber_target is None:
        return None
    if r.avg_sat is None or r.avg_fiber is None:
        return None

    sat_over = r.avg_sat > r.sat_target * 1.05
    fiber_under = r.avg_fiber < r.fiber_target * 0.80
    if not (sat_over and fiber_under):
        return None

    return AlertResult(
        rule_id="ldl_proxy_stall",
        severity="warning",
        payload={
            "avg_14d_sat_fat_g": round(r.avg_sat, 1),
            "sat_fat_target_g": round(r.sat_target, 1),
            "avg_14d_fiber_g": round(r.avg_fiber, 1),
            "fiber_target_g": round(r.fiber_target, 1),
        },
        dedup_hours=168,
    )


ALL_RULES = [
    check_sat_fat_rolling,
    check_soluble_fiber_rolling,
    check_weight_trend,
    check_weight_trend_worsening,
    check_weight_stall,
    check_hrv_anomaly,
    check_logging_gap,
    check_calorie_deficit,
    check_ldl_risk_day,
    check_ldl_proxy_stall,
    check_sodium_potassium_ratio,
    check_positive_milestone,
    check_motivational_nudge,
]

