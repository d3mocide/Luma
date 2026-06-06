"""Alert engine — runs all rules for all users, deduplicates, persists."""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import text

from luma.alerts.rules import ALL_RULES
from luma.alerts.ml import check_weight_forecast_anomaly, check_biometric_isolation_forest

ALL_RULES = list(ALL_RULES) + [check_weight_forecast_anomaly, check_biometric_isolation_forest]
from luma.db.session import AsyncSessionLocal

logger = logging.getLogger(__name__)


async def run_alert_engine() -> None:
    async with AsyncSessionLocal() as db:
        user_rows = await db.execute(text("SELECT id FROM users"))
        user_ids = [str(r.id) for r in user_rows]

    for user_id in user_ids:
        try:
            await _process_user(user_id)
        except Exception:
            logger.exception("Alert engine failed for user %s", user_id)


async def _process_user(user_id: str) -> None:
    async with AsyncSessionLocal() as db:
        # Fetch the most recent firing time per rule within the past 24h (the max dedup window).
        # The engine then checks each result against its own dedup_hours before inserting.
        fired_recently = await db.execute(
            text("""
                SELECT DISTINCT ON (rule_id) rule_id, ts
                FROM alerts
                WHERE user_id = :uid AND ts >= now() - INTERVAL '24 hours'
                ORDER BY rule_id, ts DESC
            """),
            {"uid": user_id},
        )
        recent_rule_ts: dict[str, datetime] = {r.rule_id: r.ts for r in fired_recently}
        now = datetime.now(timezone.utc)

        for rule_fn in ALL_RULES:
            try:
                result = await rule_fn(user_id, db)
            except Exception:
                logger.exception("Rule %s failed for user %s", rule_fn.__name__, user_id)
                continue

            if result is None:
                continue

            if result.rule_id in recent_rule_ts:
                last_ts = recent_rule_ts[result.rule_id]
                if last_ts.tzinfo is None:
                    last_ts = last_ts.replace(tzinfo=timezone.utc)
                age_hours = (now - last_ts).total_seconds() / 3600
                if age_hours < result.dedup_hours:
                    logger.debug(
                        "Skipping duplicate rule %s for user %s (fired %.1fh ago, dedup=%dh)",
                        result.rule_id, user_id, age_hours, result.dedup_hours,
                    )
                    continue

            alert_id = uuid.uuid4()
            now = datetime.now(timezone.utc)
            await db.execute(
                text("""
                    INSERT INTO alerts (id, user_id, ts, rule_id, severity, payload, status)
                    VALUES (:id, :uid, :ts, :rule_id, :severity, CAST(:payload AS JSONB), 'open')
                """),
                {
                    "id": str(alert_id),
                    "uid": user_id,
                    "ts": now,
                    "rule_id": result.rule_id,
                    "severity": result.severity,
                    "payload": __import__("json").dumps(result.payload),
                },
            )
            recent_rule_ts[result.rule_id] = now
            logger.info(
                "Alert fired",
                extra={"rule_id": result.rule_id, "severity": result.severity, "user_id": user_id},
            )

            if result.severity == "warning":
                try:
                    from luma.services.push_dispatcher import send_push_to_user
                    title = result.payload.get("title", "Luma health alert")
                    body = result.payload.get("summary", "A new health insight is waiting for you.")
                    await send_push_to_user(user_id, title, body, "/insights")
                except Exception:
                    logger.exception("Push on alert failed for user %s rule %s", user_id, result.rule_id)

        await db.commit()

        # Narrate newly created open alerts that have no narrative yet
        await _narrate_pending(user_id, db)


async def _narrate_pending(user_id: str, db) -> None:
    from luma.agents.insight_narrator import narrate_alert

    pending = await db.execute(
        text("""
            SELECT id, rule_id, severity, payload, ts
            FROM alerts
            WHERE user_id = :uid AND status = 'open' AND narrative IS NULL
            ORDER BY ts DESC
            LIMIT 5
        """),
        {"uid": user_id},
    )
    rows = pending.fetchall()
    for row in rows:
        try:
            narrative = await narrate_alert(
                alert_id=str(row.id),
                rule_id=row.rule_id,
                severity=row.severity,
                payload=row.payload,
            )
            await db.execute(
                text("""
                    UPDATE alerts SET narrative = :narrative
                    WHERE user_id = :uid AND id = :id AND ts = :ts
                """),
                {
                    "narrative": __import__("json").dumps(narrative),
                    "uid": user_id,
                    "id": str(row.id),
                    "ts": row.ts,
                },
            )
        except Exception:
            logger.exception("Narration failed for alert %s", row.id)

    await db.commit()
