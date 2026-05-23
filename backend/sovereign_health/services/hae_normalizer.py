"""Normalize Health Auto Export webhook payloads into biometrics rows."""
import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.dialects.postgresql import insert

logger = logging.getLogger(__name__)

# Map HAE metric names → internal metric enum
HAE_METRIC_MAP: dict[str, str] = {
    "weight_body_mass":       "weight_kg",
    "body_mass_index":        "bmi",
    "body_fat_percentage":    "body_fat_pct",
    "heart_rate_variability": "hrv_ms",
    "resting_heart_rate":     "rhr_bpm",
    "active_energy":          "active_kcal",
    "step_count":             "steps",
    # sleep_analysis handled separately (sub-type in name)
}

SLEEP_MAP = {
    "inBed":  "sleep_duration_min",
    "asleep": "sleep_asleep_min",
}

# Unit conversions to canonical units
def _convert(value: float, hae_unit: str, internal_metric: str) -> float:
    if internal_metric in ("sleep_duration_min", "sleep_asleep_min") and hae_unit in ("hr", "hours"):
        return value * 60
    return value


def _parse_hae_ts(date_str: str) -> datetime:
    """Parse HAE date strings like '2026-05-22 07:14:00 -0700'."""
    # Python's fromisoformat doesn't handle ' -0700' format in older versions
    # Use dateutil for robust parsing
    from dateutil import parser as dtparser
    return dtparser.parse(date_str).astimezone(timezone.utc)


async def normalize_hae_payload(payload: dict[str, Any], db: AsyncSession) -> int:
    """Ingest an HAE webhook payload. Returns number of rows inserted."""
    from sovereign_health.db.models import User
    from sqlalchemy import select, text

    # HAE doesn't send user_id — the shared secret identifies the operator.
    # Find the single operator user.
    result = await db.execute(select(User).where(User.role == "operator").limit(1))
    user = result.scalar_one_or_none()
    if not user:
        logger.error("No operator user found; cannot ingest HAE payload")
        return 0

    metrics_list: list[dict] = payload.get("data", {}).get("metrics", [])
    rows: list[dict] = []

    for metric_block in metrics_list:
        hae_name: str = metric_block.get("name", "")
        hae_unit: str = metric_block.get("units", "")
        data_points: list[dict] = metric_block.get("data", [])

        # Resolve internal metric name
        if hae_name.startswith("sleep_analysis"):
            sub = hae_name.split(".")[-1] if "." in hae_name else "inBed"
            internal = SLEEP_MAP.get(sub)
        else:
            internal = HAE_METRIC_MAP.get(hae_name)

        if not internal:
            logger.debug("Unknown HAE metric %s — skipping", hae_name)
            continue

        for point in data_points:
            try:
                ts = _parse_hae_ts(point["date"])
                value = _convert(float(point["qty"]), hae_unit, internal)
                source = point.get("source", "hae")
            except (KeyError, ValueError, TypeError) as exc:
                logger.warning("Malformed HAE data point %s: %s", point, exc)
                continue

            rows.append({
                "user_id": str(user.id),
                "ts": ts,
                "metric": internal,
                "value": value,
                "source": "hae",
                "source_meta": {"hae_source": source, "hae_metric": hae_name},
            })

    if not rows:
        return 0

    # Upsert — idempotent on (user_id, metric, ts, source)
    await db.execute(
        text("""
            INSERT INTO biometrics (user_id, ts, metric, value, source, source_meta)
            SELECT
                (r->>'user_id')::uuid,
                (r->>'ts')::timestamptz,
                r->>'metric',
                (r->>'value')::double precision,
                r->>'source',
                (r->>'source_meta')::jsonb
            FROM jsonb_array_elements(:rows::jsonb) AS r
            ON CONFLICT (user_id, ts, metric, source) DO NOTHING
        """),
        {"rows": __import__("orjson").dumps(rows).decode()},
    )
    await db.commit()
    logger.info("HAE ingest: inserted up to %d rows for user %s", len(rows), user.id)
    return len(rows)
