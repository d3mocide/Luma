import logging
from typing import Any

logger = logging.getLogger(__name__)


async def ingest_hae_task(ctx: dict, payload: dict[str, Any], user_id: str | None = None) -> dict:
    """Background task version of HAE ingest (deferred from webhook)."""
    from sovereign_health.db.session import AsyncSessionLocal
    from sovereign_health.services.hae_normalizer import normalize_hae_payload

    async with AsyncSessionLocal() as db:
        rows = await normalize_hae_payload(payload, db)
    return {"rows_inserted": rows}


async def run_alerts(ctx: dict) -> None:
    """Scheduled task: run alert engine. Phase 2."""
    logger.info("Alert engine run skipped — Phase 2 not yet implemented")
