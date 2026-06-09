import logging
from datetime import UTC
from typing import Any

logger = logging.getLogger(__name__)


async def ingest_hae_task(ctx: dict, payload: dict[str, Any], user_id: str | None = None) -> dict:
    """Background task version of HAE ingest (deferred from webhook)."""
    from luma.db.session import AsyncSessionLocal
    from luma.services.hae_normalizer import normalize_hae_payload

    async with AsyncSessionLocal() as db:
        rows = await normalize_hae_payload(payload, db, user_id)
    return {"rows_inserted": rows}


async def run_alerts(ctx: dict) -> None:
    """Scheduled task: run alert engine every 30 minutes."""
    from luma.alerts.engine import run_alert_engine
    logger.info("Alert engine starting")
    await run_alert_engine()
    logger.info("Alert engine complete")


async def update_case_file_task(ctx: dict, user_id: str) -> None:
    """On-demand case file update triggered when a user starts a new thread."""
    from luma.db.session import AsyncSessionLocal
    from luma.services.coach_context import update_case_file

    logger.info("Case file update triggered for user %s", user_id)
    async with AsyncSessionLocal() as db:
        await update_case_file(user_id, db)


async def update_all_case_files(ctx: dict) -> None:
    """Scheduled task: update rolling case files for all users every 2 hours."""
    from sqlalchemy import text

    from luma.db.session import AsyncSessionLocal
    from luma.services.coach_context import update_case_file

    logger.info("Case file refresh starting")
    async with AsyncSessionLocal() as db:
        user_rows = await db.execute(text("SELECT id FROM users"))
        user_ids = [str(r.id) for r in user_rows]

    for user_id in user_ids:
        try:
            async with AsyncSessionLocal() as db:
                await update_case_file(user_id, db)
        except Exception:
            logger.exception("Case file update failed for user %s", user_id)

    logger.info("Case file refresh complete (%d users)", len(user_ids))


async def sync_all_profiles(ctx: dict) -> None:
    """Scheduled task: reconcile each user's saved profile (activity level,
    height) against measured biometrics. Runs daily."""
    from sqlalchemy import text

    from luma.db.session import AsyncSessionLocal
    from luma.services.profile_sync import sync_user_profile

    logger.info("Profile sync starting")
    async with AsyncSessionLocal() as db:
        user_rows = await db.execute(text("SELECT id FROM users"))
        user_ids = [str(r.id) for r in user_rows]

    changed = 0
    for user_id in user_ids:
        try:
            async with AsyncSessionLocal() as db:
                if await sync_user_profile(user_id, db):
                    changed += 1
        except Exception:
            logger.exception("Profile sync failed for user %s", user_id)

    logger.info("Profile sync complete (%d users, %d updated)", len(user_ids), changed)


async def refresh_all_coach_contexts(ctx: dict) -> None:
    """Scheduled task: refresh coach context blobs for all users every 2 hours."""
    from sqlalchemy import text

    from luma.db.session import AsyncSessionLocal
    from luma.services.coach_context import refresh_coach_context

    logger.info("Coach context refresh starting")
    async with AsyncSessionLocal() as db:
        user_rows = await db.execute(text("SELECT id FROM users"))
        user_ids = [str(r.id) for r in user_rows]

    for user_id in user_ids:
        try:
            async with AsyncSessionLocal() as db:
                await refresh_coach_context(user_id, db)
        except Exception:
            logger.exception("Coach context refresh failed for user %s", user_id)

    logger.info("Coach context refresh complete (%d users)", len(user_ids))


async def send_daily_nudges(ctx: dict) -> None:
    """Hourly check: send push to users whose local nudge hour matches now and who haven't logged today."""
    from datetime import datetime
    from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

    from sqlalchemy import text

    from luma.db.session import AsyncSessionLocal
    from luma.services.push_dispatcher import send_push_to_user

    now_utc = datetime.now(UTC)
    logger.info("Daily nudge check at UTC %s", now_utc.isoformat())

    async with AsyncSessionLocal() as db:
        rows = await db.execute(
            text("SELECT id, nudge_hour, nudge_tz FROM users WHERE nudge_enabled = TRUE")
        )
        nudge_users = rows.fetchall()

    for row in nudge_users:
        try:
            tz = ZoneInfo(row.nudge_tz or "UTC")
        except (ZoneInfoNotFoundError, KeyError):
            tz = ZoneInfo("UTC")

        local_now = now_utc.astimezone(tz)
        if local_now.hour != row.nudge_hour:
            continue

        today_start_local = local_now.replace(hour=0, minute=0, second=0, microsecond=0)
        today_start_utc = today_start_local.astimezone(UTC)

        async with AsyncSessionLocal() as db:
            logged = await db.execute(
                text("SELECT 1 FROM meal_events WHERE user_id = :uid AND ts >= :today LIMIT 1"),
                {"uid": str(row.id), "today": today_start_utc},
            )
            already_logged = logged.fetchone() is not None

        if not already_logged:
            try:
                await send_push_to_user(
                    str(row.id),
                    "Time to log your meals",
                    "You haven't logged anything yet today. Tap to open Luma.",
                    "/log",
                )
                logger.info("Nudge sent to user %s", row.id)
            except Exception:
                logger.exception("Nudge failed for user %s", row.id)


async def send_weekly_recap(ctx: dict) -> None:
    """Sunday-evening task: generate and store a 7-day summary insight for each user.

    Runs hourly on Sundays. For each user it checks whether the current local hour
    matches their nudge_hour (defaulting to 20:00 / 8 pm) so that each user
    receives the recap at a sensible local time rather than at a fixed UTC slot.
    Dedup is handled via the alerts table (168-hour dedup on rule_id='weekly_recap').
    """
    from datetime import datetime
    from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

    from sqlalchemy import text

    from luma.agents.insight_narrator import narrate_alert
    from luma.db.session import AsyncSessionLocal
    from luma.services.push_dispatcher import send_push_to_user

    now_utc = datetime.now(UTC)
    logger.info("Weekly recap check at UTC %s", now_utc.isoformat())

    async with AsyncSessionLocal() as db:
        rows = await db.execute(
            text("SELECT id, nudge_hour, nudge_tz FROM users")
        )
        all_users = rows.fetchall()

    for row in all_users:
        try:
            tz = ZoneInfo(row.nudge_tz or "UTC")
        except (ZoneInfoNotFoundError, KeyError):
            tz = ZoneInfo("UTC")

        local_now = now_utc.astimezone(tz)
        recap_hour = row.nudge_hour if row.nudge_hour is not None else 20
        if local_now.weekday() != 6 or local_now.hour != recap_hour:
            continue

        user_id = str(row.id)
        try:
            await _generate_and_store_weekly_recap(user_id, now_utc, narrate_alert, send_push_to_user)
        except Exception:
            logger.exception("Weekly recap failed for user %s", user_id)


async def _generate_and_store_weekly_recap(user_id: str, now_utc, narrate_alert, send_push_to_user) -> None:
    import json
    import uuid

    from sqlalchemy import text

    from luma.config import settings
    from luma.db.session import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        # Dedup: skip if a recap already fired in the last 7 days
        already = await db.execute(
            text("""
                SELECT 1 FROM alerts
                WHERE user_id = :uid AND rule_id = 'weekly_recap'
                  AND ts >= now() - INTERVAL '168 hours'
                LIMIT 1
            """),
            {"uid": user_id},
        )
        if already.fetchone():
            return

        # 7-day nutrition summary
        nutr = await db.execute(
            text("""
                SELECT
                    COUNT(DISTINCT DATE(ts AT TIME ZONE :tz))          AS days_logged,
                    AVG(daily_cal)                                      AS avg_cal,
                    AVG(daily_fiber)                                    AS avg_fiber,
                    AVG(daily_sat)                                      AS avg_sat,
                    SUM(CASE WHEN daily_sat <= sat_tgt THEN 1 ELSE 0 END) AS days_on_sat_target,
                    SUM(CASE WHEN daily_fiber >= fib_tgt THEN 1 ELSE 0 END) AS days_on_fiber_target
                FROM (
                    SELECT
                        DATE(me.ts AT TIME ZONE :tz)                                  AS day,
                        SUM((me.nutrition->>'calories')::float)                        AS daily_cal,
                        SUM((me.nutrition->>'soluble_fiber_g')::float)                 AS daily_fiber,
                        SUM((me.nutrition->>'saturated_fat_g')::float)                 AS daily_sat,
                        MAX(g.daily_sat_fat_g_max::float)                              AS sat_tgt,
                        MAX(g.daily_soluble_fiber_g::float)                            AS fib_tgt
                    FROM meal_events me
                    JOIN goals g ON g.user_id = me.user_id
                    WHERE me.user_id = :uid AND me.ts >= now() - INTERVAL '7 days'
                    GROUP BY DATE(me.ts AT TIME ZONE :tz)
                ) daily
            """),
            {"uid": user_id, "tz": settings.server_timezone},
        )
        nr = nutr.fetchone()

        # Weight change over the week
        weight = await db.execute(
            text("""
                SELECT
                    MIN(last_value) FILTER (WHERE day = (SELECT MIN(day) FROM biometrics_daily WHERE user_id = :uid AND metric = 'weight_kg' AND day >= now() - INTERVAL '7 days')) AS start_weight,
                    MAX(last_value) FILTER (WHERE day = (SELECT MAX(day) FROM biometrics_daily WHERE user_id = :uid AND metric = 'weight_kg' AND day >= now() - INTERVAL '7 days')) AS end_weight,
                    g.target_weight_kg::float AS target
                FROM biometrics_daily b
                JOIN goals g ON g.user_id = b.user_id
                WHERE b.user_id = :uid AND b.metric = 'weight_kg'
                  AND b.day >= now() - INTERVAL '7 days'
                GROUP BY g.target_weight_kg
            """),
            {"uid": user_id},
        )
        wr = weight.fetchone()

        payload: dict = {
            "days_logged": int(nr.days_logged or 0) if nr else 0,
            "avg_cal": round(nr.avg_cal, 0) if nr and nr.avg_cal else None,
            "avg_fiber_g": round(nr.avg_fiber, 1) if nr and nr.avg_fiber else None,
            "avg_sat_fat_g": round(nr.avg_sat, 1) if nr and nr.avg_sat else None,
            "days_on_sat_target": int(nr.days_on_sat_target or 0) if nr else 0,
            "days_on_fiber_target": int(nr.days_on_fiber_target or 0) if nr else 0,
        }
        if wr and wr.start_weight and wr.end_weight:
            payload["weight_change_kg"] = round(wr.end_weight - wr.start_weight, 2)
            if wr.target:
                payload["target_weight_kg"] = round(wr.target, 1)

        alert_id = uuid.uuid4()
        await db.execute(
            text("""
                INSERT INTO alerts (id, user_id, ts, rule_id, severity, payload, status)
                VALUES (:id, :uid, :ts, 'weekly_recap', 'positive', CAST(:payload AS JSONB), 'open')
            """),
            {
                "id": str(alert_id),
                "uid": user_id,
                "ts": now_utc,
                "payload": json.dumps(payload),
            },
        )
        await db.commit()

    # Narrate outside the session to avoid long-held connections during LLM call
    try:
        narrative = await narrate_alert(
            alert_id=str(alert_id),
            rule_id="weekly_recap",
            severity="positive",
            payload=payload,
        )
        async with AsyncSessionLocal() as db:
            await db.execute(
                text("UPDATE alerts SET narrative = :n WHERE id = :id AND user_id = :uid AND ts = :ts"),
                {"n": json.dumps(narrative), "id": str(alert_id), "uid": user_id, "ts": now_utc},
            )
            await db.commit()
    except Exception:
        logger.exception("Weekly recap narration failed for user %s", user_id)
        return

    try:
        headline = narrative.get("headline", "Your weekly recap is ready")
        body_text = narrative.get("body", "See how your week went.")
        await send_push_to_user(user_id, headline, body_text, "/insights")
    except Exception:
        logger.exception("Weekly recap push failed for user %s", user_id)
