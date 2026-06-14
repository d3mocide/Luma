"""Alert engine — runs all rules for all users, deduplicates, persists."""
from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime

from sqlalchemy import text

from luma.alerts.ml import check_biometric_isolation_forest
from luma.alerts.rules import ALL_RULES, RULE_REGISTRY
from luma.db.session import AsyncSessionLocal

ALL_RULES = list(ALL_RULES) + [check_biometric_isolation_forest]

# Full registry including the ML-based rule (lives outside rules.py).
_RULE_REGISTRY = dict(RULE_REGISTRY)
_RULE_REGISTRY["biometric_cluster_anomaly"] = check_biometric_isolation_forest

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


async def _process_user(user_id: str, bypass_dedup: bool = False) -> None:
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
        now = datetime.now(UTC)

        # Persist alerts regardless of preference (they still surface in-app);
        # only the push is gated by the user's health-alert opt-out.
        pref_row = await db.execute(
            text("SELECT health_alerts_enabled FROM users WHERE id = :uid"),
            {"uid": user_id},
        )
        pref = pref_row.first()
        health_alerts_enabled = bool(pref.health_alerts_enabled) if pref else True

        for rule_fn in ALL_RULES:
            try:
                result = await rule_fn(user_id, db)
            except Exception:
                logger.exception("Rule %s failed for user %s", rule_fn.__name__, user_id)
                continue

            if result is None:
                continue

            if not bypass_dedup and result.rule_id in recent_rule_ts:
                last_ts = recent_rule_ts[result.rule_id]
                if last_ts.tzinfo is None:
                    last_ts = last_ts.replace(tzinfo=UTC)
                age_hours = (now - last_ts).total_seconds() / 3600
                if age_hours < result.dedup_hours:
                    logger.debug(
                        "Skipping duplicate rule %s for user %s (fired %.1fh ago, dedup=%dh)",
                        result.rule_id, user_id, age_hours, result.dedup_hours,
                    )
                    continue

            alert_id = uuid.uuid4()
            now = datetime.now(UTC)
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

            if result.severity == "warning" and health_alerts_enabled:
                try:
                    from luma.services.push_dispatcher import send_push_to_user
                    title = result.payload.get("title", "Luma health alert")
                    body = result.payload.get("summary", "A new health insight is waiting for you.")
                    await send_push_to_user(user_id, title, body, "/coach?tab=insights")
                except Exception:
                    logger.exception("Push on alert failed for user %s rule %s", user_id, result.rule_id)

        await db.commit()

        # Auto-resolve open alerts whose conditions have since cleared.
        await _resolve_cleared_alerts(user_id, db)

        # Narrate newly created open alerts that have no narrative yet.
        await _narrate_pending(user_id, db)


async def _resolve_cleared_alerts(user_id: str, db) -> None:
    """Auto-resolve open alerts whose triggering condition has since cleared.

    Runs every engine cycle. Groups open alerts by rule_id and re-runs each
    rule once. If a rule now returns None the condition no longer holds, so all
    open alerts for that rule are marked 'resolved' and removed from the Today
    widget without requiring a manual dismiss.
    """
    open_rows = await db.execute(
        text("""
            SELECT id, rule_id
            FROM alerts
            WHERE user_id = :uid AND status = 'open'
        """),
        {"uid": user_id},
    )
    open_alerts = open_rows.fetchall()
    if not open_alerts:
        return

    # Group alert ids by rule_id; only process rules we know how to re-check.
    from collections import defaultdict
    by_rule: dict[str, list[str]] = defaultdict(list)
    for row in open_alerts:
        if row.rule_id in _RULE_REGISTRY:
            by_rule[row.rule_id].append(str(row.id))

    to_resolve: list[str] = []
    for rule_id, alert_ids in by_rule.items():
        try:
            result = await _RULE_REGISTRY[rule_id](user_id, db)
        except Exception:
            logger.debug("Resolution check failed for rule %s user %s", rule_id, user_id)
            continue
        if result is None:
            to_resolve.extend(alert_ids)
            logger.info(
                "Auto-resolving %d alert(s) for rule %s (condition cleared)",
                len(alert_ids), rule_id,
                extra={"user_id": user_id, "rule_id": rule_id},
            )

    for alert_id in to_resolve:
        await db.execute(
            text("UPDATE alerts SET status = 'resolved' WHERE id = :id AND status = 'open'"),
            {"id": alert_id},
        )
    if to_resolve:
        await db.commit()


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
