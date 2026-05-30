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
