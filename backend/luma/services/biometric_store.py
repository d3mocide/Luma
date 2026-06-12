"""Shared persistence core for biometrics ingest.

Provider-specific normalizers (HAE, Health Connect, …) parse their own
payload shapes into a list of canonical rows and hand them to
``persist_biometric_rows``. Everything downstream of parsing — sleep-score
derivation, per-user source gating, multi-device dedup, the upsert, and the
continuous-aggregate refresh — lives here so it stays identical across sources.
"""
import logging
from datetime import datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

# Cumulative metrics that sum over a day. When a user reports the same one from
# two ecosystems (iOS + Android), the daily aggregate double-counts because the
# timestamps don't collide, so only the user's chosen data_source contributes
# these. Scalar metrics (weight, heart rate, sleep, …) never double-count — the
# (ts, metric) dedup collapses overlaps — so they always merge regardless.
ADDITIVE_METRICS: frozenset[str] = frozenset({
    "steps",
    "distance_km",
    "active_kcal",
    "flights_climbed",
})


def _source_priority(source: str) -> int:
    """Rank a source so overlapping multi-device readings collapse to one.

    Mirrors the SQL biometric_source_priority() function (migration 0007):
    Apple Watch outranks iPhone, which outranks anything else. Apple Health
    reports the same instant from several devices; summing all of them
    double-counts energy, so we keep only the highest-ranked source per
    (ts, metric).
    """
    s = (source or "").lower()
    if "watch" in s:
        return 3
    if "phone" in s:
        return 2
    return 1


def _compute_sleep_scores(rows: list[dict], user_id: str) -> list[dict]:
    """Derive a sleep_score row for each timestamp that has sleep_duration_min.

    Score (0–100):
      Duration component  (0–60): scales linearly to 480 min (8 h), capped at 60.
      Efficiency component (0–40): asleep/inBed ratio × 40. Falls back to 20
                                   (neutral) when only inBed data is present.
    """
    sleep_by_ts: dict[Any, dict[str, dict]] = {}
    for row in rows:
        if row["metric"] in ("sleep_duration_min", "sleep_asleep_min"):
            sleep_by_ts.setdefault(row["ts"], {})[row["metric"]] = row

    score_rows: list[dict] = []
    for ts, sleep_rows in sleep_by_ts.items():
        duration_row = sleep_rows.get("sleep_duration_min")
        if not duration_row:
            continue
        duration = duration_row["value"]
        asleep_row = sleep_rows.get("sleep_asleep_min")
        asleep = asleep_row["value"] if asleep_row else None

        duration_score = min(60.0, (duration / 480.0) * 60.0)
        if asleep is not None and duration > 0:
            efficiency_score = min(40.0, (asleep / duration) * 40.0)
        else:
            efficiency_score = 20.0  # neutral when efficiency is unknown

        src_meta = duration_row.get("source_meta") or {}
        score_rows.append({
            "user_id": user_id,
            "ts": ts,
            "metric": "sleep_score",
            "value": round(duration_score + efficiency_score, 1),
            "source": duration_row["source"],
            "source_meta": {
                "hae_source": src_meta.get("hae_source", duration_row["source"]),
                "hae_metric": "computed",
            },
        })
    return score_rows


def _gate_additive(rows: list[dict], source_ecosystem: str, data_source: str | None) -> list[dict]:
    """Drop additive metrics that don't come from the user's chosen source.

    When ``data_source`` is None the user hasn't expressed a preference, so
    nothing is gated (preserves single-source behavior). Otherwise additive
    metrics survive only when this payload's ecosystem is the chosen one.
    """
    if data_source is None or source_ecosystem == data_source:
        return rows
    kept = [r for r in rows if r["metric"] not in ADDITIVE_METRICS]
    dropped = len(rows) - len(kept)
    if dropped:
        logger.info(
            "Gated %d additive rows from %s (user data_source=%s)",
            dropped, source_ecosystem, data_source,
        )
    return kept


async def persist_biometric_rows(
    rows: list[dict],
    db: AsyncSession,
    user_id: Any,
    *,
    source_ecosystem: str,
    data_source: str | None = None,
) -> int:
    """Persist canonical biometric rows. Returns the number of rows written.

    ``rows`` carry keys: user_id, ts, metric, value, source, source_meta.
    All rows in one call originate from a single ``source_ecosystem``
    (e.g. "apple_health" or "health_connect").
    """
    from sqlalchemy import text

    # Derive sleep_score from any sleep metrics before gating/dedup.
    rows = rows + _compute_sleep_scores(rows, str(user_id))

    rows = _gate_additive(rows, source_ecosystem, data_source)

    if not rows:
        return 0

    # Collapse overlapping multi-device readings to one row per (ts, metric),
    # keeping the highest-priority source. Required before the upsert: the DB
    # key is (user_id, ts, metric), and ON CONFLICT DO UPDATE rejects a
    # statement that touches the same key twice. Tie-break on the smaller source
    # string to match migration 0007's backfill.
    deduped: dict[tuple[datetime, str], dict] = {}
    for row in rows:
        key = (row["ts"], row["metric"])
        existing = deduped.get(key)
        if existing is None:
            deduped[key] = row
            continue
        new_p, old_p = _source_priority(row["source"]), _source_priority(existing["source"])
        if new_p > old_p or (new_p == old_p and row["source"] < existing["source"]):
            deduped[key] = row
    rows = list(deduped.values())

    # Upsert — idempotent on (user_id, ts, metric). A later-arriving
    # higher-priority source replaces a previously stored lower-priority one.
    # NB: bind param is wrapped in CAST(...) so SQLAlchemy's text() regex doesn't
    # see `:rows::jsonb` (negative-lookahead on `::` would clip the param name).
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
            FROM jsonb_array_elements(CAST(:rows AS jsonb)) AS r
            ON CONFLICT (user_id, ts, metric) DO UPDATE
                SET value       = EXCLUDED.value,
                    source      = EXCLUDED.source,
                    source_meta = EXCLUDED.source_meta
                WHERE biometric_source_priority(EXCLUDED.source)
                      > biometric_source_priority(biometrics.source)
        """),
        {"rows": __import__("orjson").dumps(rows).decode()},
    )
    await db.commit()
    logger.info("Biometric ingest (%s): inserted up to %d rows for user %s", source_ecosystem, len(rows), user_id)

    # Refresh the continuous aggregate immediately so Trends reflects this data
    # without waiting for the hourly policy job. Must run in AUTOCOMMIT mode.
    await _refresh_biometrics_daily(rows)

    return len(rows)


async def _refresh_biometrics_daily(rows: list[dict]) -> None:
    """Refresh biometrics_daily for the date range covered by the ingested rows."""
    if not rows:
        return
    from datetime import timedelta

    ts_values = [r["ts"] for r in rows]
    start = min(ts_values).replace(hour=0, minute=0, second=0, microsecond=0)
    end = max(ts_values).replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=2)

    try:
        from sqlalchemy import text as sa_text

        from luma.db.session import engine
        async with engine.connect() as conn:
            await conn.execution_options(isolation_level="AUTOCOMMIT")
            await conn.execute(
                sa_text("CALL refresh_continuous_aggregate('biometrics_daily', :start, :end)"),
                {"start": start, "end": end},
            )
        logger.debug("biometrics_daily refreshed for %s → %s", start.date(), end.date())
    except Exception as exc:
        # Non-fatal: the scheduled policy will catch up within an hour.
        logger.warning("biometrics_daily refresh failed (will self-heal): %s", exc)
