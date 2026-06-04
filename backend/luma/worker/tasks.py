import logging
from typing import Any

logger = logging.getLogger(__name__)


async def ingest_hae_task(ctx: dict, payload: dict[str, Any], user_id: str | None = None) -> dict:
    """Background task version of HAE ingest (deferred from webhook)."""
    from luma.db.session import AsyncSessionLocal
    from luma.services.hae_normalizer import normalize_hae_payload

    async with AsyncSessionLocal() as db:
        rows = await normalize_hae_payload(payload, db)
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
    from datetime import datetime, timezone
    from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
    from sqlalchemy import text
    from luma.db.session import AsyncSessionLocal
    from luma.services.push_dispatcher import send_push_to_user

    now_utc = datetime.now(timezone.utc)
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
        today_start_utc = today_start_local.astimezone(timezone.utc)

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
