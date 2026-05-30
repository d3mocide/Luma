"""Build and cache a structured user context blob for the coach agent."""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


async def get_coach_context(user_id: str, db: AsyncSession) -> dict:
    """Return the cached context blob, or build it fresh if stale/missing."""
    row = await db.execute(
        text("SELECT context, updated_at FROM coach_context WHERE user_id = :uid"),
        {"uid": user_id},
    )
    cached = row.fetchone()

    if cached:
        age_hours = (datetime.now(timezone.utc) - cached.updated_at).total_seconds() / 3600
        if age_hours < 2:
            return cached.context

    fresh = await _build_context(user_id, db)

    await db.execute(
        text("""
            INSERT INTO coach_context (user_id, context, updated_at)
            VALUES (:uid, :ctx::jsonb, now())
            ON CONFLICT (user_id) DO UPDATE
            SET context = EXCLUDED.context, updated_at = now()
        """),
        {"uid": user_id, "ctx": json.dumps(fresh)},
    )
    await db.commit()
    return fresh


async def refresh_coach_context(user_id: str, db: AsyncSession) -> None:
    """Force-refresh the context blob (called by worker)."""
    fresh = await _build_context(user_id, db)
    await db.execute(
        text("""
            INSERT INTO coach_context (user_id, context, updated_at)
            VALUES (:uid, :ctx::jsonb, now())
            ON CONFLICT (user_id) DO UPDATE
            SET context = EXCLUDED.context, updated_at = now()
        """),
        {"uid": user_id, "ctx": json.dumps(fresh)},
    )
    await db.commit()


async def _build_context(user_id: str, db: AsyncSession) -> dict:
    ctx: dict = {}

    # Goals
    goals_row = await db.execute(
        text("""
            SELECT target_weight_kg, target_ldl_mg_dl, daily_calorie_target,
                   daily_sat_fat_g_max, daily_soluble_fiber_g, daily_protein_g_min,
                   dietary_pattern
            FROM goals WHERE user_id = :uid
        """),
        {"uid": user_id},
    )
    g = goals_row.fetchone()
    if g:
        ctx["goals"] = {
            "target_weight_kg": float(g.target_weight_kg) if g.target_weight_kg else None,
            "target_ldl_mg_dl": g.target_ldl_mg_dl,
            "daily_calorie_target": g.daily_calorie_target,
            "daily_sat_fat_g_max": float(g.daily_sat_fat_g_max) if g.daily_sat_fat_g_max else None,
            "daily_soluble_fiber_g": float(g.daily_soluble_fiber_g) if g.daily_soluble_fiber_g else None,
            "daily_protein_g_min": float(g.daily_protein_g_min) if g.daily_protein_g_min else None,
            "dietary_pattern": g.dietary_pattern,
        }

    # 7-day nutrition averages
    nutr_row = await db.execute(
        text("""
            SELECT
                AVG((nutrition->>'calories')::float)       AS avg_cal,
                AVG((nutrition->>'saturated_fat_g')::float) AS avg_sat,
                AVG((nutrition->>'soluble_fiber_g')::float) AS avg_fiber,
                AVG((nutrition->>'protein_g')::float)       AS avg_protein
            FROM meal_events
            WHERE user_id = :uid AND ts >= now() - INTERVAL '7 days'
        """),
        {"uid": user_id},
    )
    nr = nutr_row.fetchone()
    if nr and nr.avg_cal is not None:
        ctx["nutrition_7d_avg"] = {
            "calories": round(nr.avg_cal, 0) if nr.avg_cal else None,
            "sat_fat_g": round(nr.avg_sat, 1) if nr.avg_sat else None,
            "fiber_g": round(nr.avg_fiber, 1) if nr.avg_fiber else None,
            "protein_g": round(nr.avg_protein, 1) if nr.avg_protein else None,
        }

    # Latest biometrics
    bio_row = await db.execute(
        text("""
            SELECT DISTINCT ON (metric) metric, value, ts
            FROM biometrics
            WHERE user_id = :uid
              AND metric IN ('weight_kg','hrv_ms','rhr_bpm','sleep_score','sleep_duration_min')
            ORDER BY metric, ts DESC
        """),
        {"uid": user_id},
    )
    bio = {r.metric: round(r.value, 1) for r in bio_row}
    if bio:
        ctx["biometrics_latest"] = bio

    # Weight trend (28d slope → kg/week)
    slope_row = await db.execute(
        text("""
            SELECT regr_slope(last_value, extract(epoch from day)) * 86400 * 7 AS slope
            FROM biometrics_daily
            WHERE user_id = :uid AND metric = 'weight_kg' AND day >= now() - INTERVAL '28 days'
        """),
        {"uid": user_id},
    )
    sr = slope_row.fetchone()
    if sr and sr.slope is not None:
        ctx["weight_trend_kg_per_week"] = round(sr.slope, 3)

    # Logging streak
    streak_row = await db.execute(
        text("""
            SELECT COUNT(DISTINCT DATE(ts AT TIME ZONE 'UTC')) AS streak
            FROM meal_events
            WHERE user_id = :uid AND ts >= now() - INTERVAL '30 days'
        """),
        {"uid": user_id},
    )
    sr2 = streak_row.fetchone()
    if sr2:
        ctx["recent_logging_days_30d"] = sr2.streak

    # Last 3 alerts with narratives
    alert_rows = await db.execute(
        text("""
            SELECT rule_id, severity, narrative, ts
            FROM alerts
            WHERE user_id = :uid AND narrative IS NOT NULL
            ORDER BY ts DESC LIMIT 3
        """),
        {"uid": user_id},
    )
    alerts = []
    for r in alert_rows:
        try:
            narr = json.loads(r.narrative) if isinstance(r.narrative, str) else r.narrative
        except (TypeError, json.JSONDecodeError):
            narr = {}
        alerts.append({
            "rule_id": r.rule_id,
            "severity": r.severity,
            "headline": narr.get("headline", ""),
            "ts": r.ts.isoformat(),
        })
    if alerts:
        ctx["recent_alerts"] = alerts

    return ctx


def format_context_for_prompt(ctx: dict) -> str:
    """Render the context blob as a concise system prompt addendum."""
    if not ctx:
        return ""

    lines = ["## User snapshot (auto-updated every 2 hours)"]

    if goals := ctx.get("goals"):
        parts = []
        if goals.get("daily_calorie_target"):
            parts.append(f"{goals['daily_calorie_target']} kcal/day target")
        if goals.get("daily_sat_fat_g_max"):
            parts.append(f"sat fat ≤{goals['daily_sat_fat_g_max']}g")
        if goals.get("daily_soluble_fiber_g"):
            parts.append(f"fiber ≥{goals['daily_soluble_fiber_g']}g")
        if goals.get("target_weight_kg"):
            parts.append(f"goal weight {goals['target_weight_kg']} kg")
        if goals.get("dietary_pattern"):
            parts.append(goals["dietary_pattern"])
        if parts:
            lines.append("**Goals:** " + ", ".join(parts))

    if nutr := ctx.get("nutrition_7d_avg"):
        parts = []
        if nutr.get("calories"):
            parts.append(f"{int(nutr['calories'])} kcal avg")
        if nutr.get("sat_fat_g"):
            parts.append(f"{nutr['sat_fat_g']}g sat fat avg")
        if nutr.get("fiber_g"):
            parts.append(f"{nutr['fiber_g']}g fiber avg")
        if parts:
            lines.append("**Last 7d nutrition:** " + ", ".join(parts))

    if bio := ctx.get("biometrics_latest"):
        parts = []
        if bio.get("weight_kg"):
            parts.append(f"weight {bio['weight_kg']} kg")
        if bio.get("hrv_ms"):
            parts.append(f"HRV {bio['hrv_ms']} ms")
        if bio.get("sleep_score"):
            parts.append(f"sleep score {bio['sleep_score']}")
        if parts:
            lines.append("**Latest biometrics:** " + ", ".join(parts))

    if (slope := ctx.get("weight_trend_kg_per_week")) is not None:
        direction = "↓" if slope < 0 else "↑" if slope > 0 else "→"
        lines.append(f"**Weight trend (28d):** {direction} {abs(slope):.2f} kg/week")

    if ctx.get("recent_logging_days_30d") is not None:
        lines.append(f"**Logging consistency:** {ctx['recent_logging_days_30d']}/30 days logged")

    if alerts := ctx.get("recent_alerts"):
        lines.append("**Recent Luma alerts:**")
        for a in alerts:
            lines.append(f"  - [{a['severity']}] {a['headline']} ({a['ts'][:10]})")

    return "\n".join(lines)
