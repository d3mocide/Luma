"""Insights API — alert history and acknowledgement."""
from __future__ import annotations

import json
import logging
from datetime import UTC
from typing import Any

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import text

from luma.deps import CurrentUser, DbDep

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("")
async def list_insights(
    user: CurrentUser,
    db: DbDep,
    limit: int = 20,
    offset: int = 0,
) -> dict[str, Any]:
    rows = await db.execute(
        text("""
            SELECT id, ts, rule_id, severity, payload, narrative, status
            FROM alerts
            WHERE user_id = :uid
            ORDER BY ts DESC
            LIMIT :limit OFFSET :offset
        """),
        {"uid": str(user.id), "limit": limit, "offset": offset},
    )
    items = []
    for r in rows:
        narrative = {}
        if r.narrative:
            try:
                narrative = json.loads(r.narrative) if isinstance(r.narrative, str) else r.narrative
            except (json.JSONDecodeError, TypeError):
                pass
        items.append({
            "id": str(r.id),
            "ts": r.ts.isoformat(),
            "rule_id": r.rule_id,
            "severity": r.severity,
            "payload": r.payload,
            "headline": narrative.get("headline", ""),
            "body": narrative.get("body", ""),
            "thread_seed": narrative.get("thread_seed", ""),
            "status": r.status,
        })
    return {"insights": items, "limit": limit, "offset": offset}


@router.post("/{alert_id}/ack")
async def ack_insight(
    alert_id: str,
    user: CurrentUser,
    db: DbDep,
) -> dict[str, str]:
    result = await db.execute(
        text("""
            UPDATE alerts SET status = 'dismissed'
            WHERE user_id = :uid AND id = :id AND status = 'open'
        """),
        {"uid": str(user.id), "id": alert_id},
    )
    await db.commit()
    if result.rowcount == 0:  # type: ignore[attr-defined]
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert not found or already closed")
    return {"status": "dismissed"}


@router.post("/trigger")
async def trigger_insights(
    user: CurrentUser,
    db: DbDep,
    bypass_dedup: bool = False,
) -> dict[str, Any]:
    from datetime import datetime, timedelta

    from luma.alerts.engine import _process_user
    
    start_time = datetime.now(UTC) - timedelta(seconds=2)
    try:
        await _process_user(str(user.id), bypass_dedup=bypass_dedup)
    except Exception:
        logger.exception("Alert engine execution failed for user %s", user.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Alert engine execution failed",
        )
        
    # Fetch alerts created during this execution
    rows = await db.execute(
        text("""
            SELECT id, ts, rule_id, severity, payload, narrative, status
            FROM alerts
            WHERE user_id = :uid AND ts >= :start
            ORDER BY ts DESC
        """),
        {"uid": str(user.id), "start": start_time},
    )
    items = []
    for r in rows:
        narrative = {}
        if r.narrative:
            try:
                narrative = json.loads(r.narrative) if isinstance(r.narrative, str) else r.narrative
            except (json.JSONDecodeError, TypeError):
                pass
        items.append({
            "id": str(r.id),
            "ts": r.ts.isoformat(),
            "rule_id": r.rule_id,
            "severity": r.severity,
            "payload": r.payload,
            "headline": narrative.get("headline", ""),
            "body": narrative.get("body", ""),
            "thread_seed": narrative.get("thread_seed", ""),
            "status": r.status,
        })
    return {"insights": items}
