"""Normalize Android Health Connect webhook payloads into biometrics rows.

Targets the payload emitted by the mcnaveen/health-connect-webhook app:
a flat envelope ``{"timestamp", "app_version", "<type>": [...]}`` where each
top-level snake_case key is an array of records for one data type. Units are
fixed per type (kilograms, meters, celsius, …), so conversions are hardcoded
rather than driven by a per-record unit string like HAE.

Several Health Connect types are intentionally NOT mapped here:
  - heart_rate (per-sample) / heart_rate_variability (RMSSD, not Apple's SDNN)
    and basal_metabolic_rate (watts, not kcal) are semantic mismatches with the
    existing series and would distort trends.
  - skin_temperature is a delta, not an absolute reading.
  - blood_glucose / vo2_max / bone_mass have no internal metric yet.
  - nutrition / hydration / exercise belong to the food-logging system, not
    biometrics — routing them here would corrupt both models.
"""
import logging
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from luma.services.biometric_store import persist_biometric_rows

logger = logging.getLogger(__name__)

# Instantaneous scalar metrics, timestamped on `time`.
# array_name -> (internal_metric, value_field, multiplier)
_SCALAR_MAP: dict[str, tuple[str, str, float]] = {
    "weight":             ("weight_kg", "kilograms", 1.0),
    "height":             ("height_cm", "meters", 100.0),
    "resting_heart_rate": ("rhr_bpm", "bpm", 1.0),
    "oxygen_saturation":  ("spo2_pct", "percentage", 1.0),
    "body_temperature":   ("body_temp_c", "celsius", 1.0),
    "respiratory_rate":   ("respiratory_rate_bpm", "rate", 1.0),
    "body_fat":           ("body_fat_pct", "percentage", 1.0),
    "lean_body_mass":     ("lean_body_mass_kg", "kilograms", 1.0),
}

# Cumulative interval metrics, timestamped on `end_time` so re-syncs of the same
# window overwrite (idempotent) instead of appending.
# array_name -> (internal_metric, value_field, multiplier)
_ADDITIVE_MAP: dict[str, tuple[str, str, float]] = {
    "steps":           ("steps", "count", 1.0),
    "distance":        ("distance_km", "meters", 0.001),
    "active_calories": ("active_kcal", "calories", 1.0),
}

# Stage names (Health Connect SleepSessionRecord) that count as time asleep.
_AWAKE_STAGES = ("awake", "out_of_bed")


def _parse_iso_ts(value: str) -> datetime:
    """Parse a Health Connect ISO-8601 instant into UTC."""
    from dateutil import parser as dtparser
    return dtparser.parse(value).astimezone(UTC)


def _row(user_id: Any, ts: datetime, metric: str, value: float, hc_type: str) -> dict:
    return {
        "user_id": str(user_id),
        "ts": ts,
        "metric": metric,
        "value": value,
        "source": "health_connect",
        "source_meta": {"hc_type": hc_type},
    }


def _scalar_rows(user_id: Any, hc_type: str, records: list[dict]) -> list[dict]:
    internal, field, mult = _SCALAR_MAP[hc_type]
    rows: list[dict] = []
    for rec in records:
        try:
            ts = _parse_iso_ts(rec["time"])
            value = float(rec[field]) * mult
        except (KeyError, ValueError, TypeError) as exc:
            logger.warning("Malformed Health Connect %s record %s: %s", hc_type, rec, exc)
            continue
        rows.append(_row(user_id, ts, internal, value, hc_type))
    return rows


def _additive_rows(user_id: Any, hc_type: str, records: list[dict]) -> list[dict]:
    internal, field, mult = _ADDITIVE_MAP[hc_type]
    rows: list[dict] = []
    for rec in records:
        try:
            ts = _parse_iso_ts(rec["end_time"])
            value = float(rec[field]) * mult
        except (KeyError, ValueError, TypeError) as exc:
            logger.warning("Malformed Health Connect %s record %s: %s", hc_type, rec, exc)
            continue
        rows.append(_row(user_id, ts, internal, value, hc_type))
    return rows


def _blood_pressure_rows(user_id: Any, records: list[dict]) -> list[dict]:
    rows: list[dict] = []
    for rec in records:
        try:
            ts = _parse_iso_ts(rec["time"])
        except (KeyError, ValueError, TypeError) as exc:
            logger.warning("Malformed Health Connect blood_pressure record %s: %s", rec, exc)
            continue
        for field, internal in (("systolic", "bp_systolic_mmhg"), ("diastolic", "bp_diastolic_mmhg")):
            raw = rec.get(field)
            if raw is None:
                continue
            try:
                rows.append(_row(user_id, ts, internal, float(raw), "blood_pressure"))
            except (ValueError, TypeError) as exc:
                logger.warning("Bad Health Connect blood_pressure %s=%s: %s", field, raw, exc)
    return rows


def _asleep_minutes(stages: list[dict]) -> float | None:
    """Sum the duration of stages that count as time asleep. None if unknowable."""
    total = 0.0
    counted = False
    for stage in stages:
        name = str(stage.get("stage") or stage.get("type") or stage.get("name") or "").lower()
        if not name or any(a in name for a in _AWAKE_STAGES):
            continue
        try:
            start = _parse_iso_ts(stage["start_time"])
            end = _parse_iso_ts(stage["end_time"])
        except (KeyError, ValueError, TypeError):
            continue
        total += (end - start).total_seconds() / 60.0
        counted = True
    return total if counted else None


def _sleep_rows(user_id: Any, records: list[dict]) -> list[dict]:
    rows: list[dict] = []
    for rec in records:
        try:
            ts = _parse_iso_ts(rec["session_end_time"])
            duration_min = float(rec["duration_seconds"]) / 60.0
        except (KeyError, ValueError, TypeError) as exc:
            logger.warning("Malformed Health Connect sleep record %s: %s", rec, exc)
            continue
        rows.append(_row(user_id, ts, "sleep_duration_min", duration_min, "sleep"))
        asleep = _asleep_minutes(rec.get("stages") or [])
        if asleep is not None:
            rows.append(_row(user_id, ts, "sleep_asleep_min", asleep, "sleep"))
    return rows


async def normalize_health_connect_payload(
    payload: dict[str, Any],
    db: AsyncSession,
    user_id: Any,
    *,
    data_source: str | None = None,
) -> int:
    """Ingest a Health Connect webhook payload. Returns number of rows inserted."""
    rows: list[dict] = []

    for hc_type, records in payload.items():
        if not isinstance(records, list):
            continue  # envelope scalars (timestamp, app_version)
        if hc_type in _SCALAR_MAP:
            rows.extend(_scalar_rows(user_id, hc_type, records))
        elif hc_type in _ADDITIVE_MAP:
            rows.extend(_additive_rows(user_id, hc_type, records))
        elif hc_type == "blood_pressure":
            rows.extend(_blood_pressure_rows(user_id, records))
        elif hc_type == "sleep":
            rows.extend(_sleep_rows(user_id, records))
        else:
            logger.debug("Unmapped Health Connect type %s — skipping", hc_type)

    return await persist_biometric_rows(
        rows, db, user_id, source_ecosystem="health_connect", data_source=data_source,
    )
