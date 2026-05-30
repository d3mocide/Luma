"""HAE diagnostic endpoints — surface all received fields, coverage gaps, and name misalignments."""

import difflib
import logging
import re
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import text

from luma.deps import CurrentUser, DbDep
from luma.services.hae_normalizer import (
    HAE_AGGREGATE_MAP,
    HAE_METRIC_MAP,
    SLEEP_MAP,
)

logger = logging.getLogger(__name__)
router = APIRouter()

# Sleep-stage fields carried by HAE v4 aggregated records that we don't store yet.
_SLEEP_V4_UNUSED_FIELDS: frozenset[str] = frozenset({"Core", "Deep", "Rem", "Awake"})

# Per aggregate metric: fields present in every data point beyond the one we extract.
_AGGREGATE_UNUSED_FIELDS: dict[str, frozenset[str]] = {
    "heart_rate": frozenset({"Min", "Max"}),  # we only extract Avg
}

# All internal metric names the normalizer can produce (including computed).
_ALL_INTERNAL_METRICS: frozenset[str] = frozenset(
    set(HAE_METRIC_MAP.values())
    | {v[0] for v in HAE_AGGREGATE_MAP.values()}
    | set(SLEEP_MAP.values())
    | {"sleep_score"}
)

# All HAE metric names we explicitly handle.
_ALL_KNOWN_HAE_NAMES: frozenset[str] = frozenset(
    set(HAE_METRIC_MAP.keys())
    | set(HAE_AGGREGATE_MAP.keys())
    | {"sleep_analysis", "sleep_analysis.inBed", "sleep_analysis.asleep"}
)


# ── name-alignment helpers ────────────────────────────────────────────────────

def _to_snake(name: str) -> str:
    """Lower-snake-case a camelCase / PascalCase / spaced / hyphenated name."""
    name = re.sub(r"([A-Z])", r"_\1", name).lower()
    name = re.sub(r"[\s\-]+", "_", name)
    return re.sub(r"_+", "_", name).strip("_")


def _misalignment_match(hae_name: str) -> str | None:
    """Return the known HAE name that hae_name normalises to, or None."""
    norm = _to_snake(hae_name)
    return norm if norm in _ALL_KNOWN_HAE_NAMES else None


def _fuzzy_suggestions(hae_name: str, n: int = 3) -> list[str]:
    return difflib.get_close_matches(
        _to_snake(hae_name), _ALL_KNOWN_HAE_NAMES, n=n, cutoff=0.6
    )


# ── GET: stored-data summary + full schema reference ─────────────────────────

@router.get("/settings/hae-diagnostic")
async def hae_diagnostic_summary(user: CurrentUser, db: DbDep) -> dict[str, Any]:
    """Return stored biometrics coverage for this user and the full HAE→internal schema map.

    stored_metrics groups by (internal_metric, originating_hae_metric) so misalignments
    between what HAE sends and what we record are immediately visible.
    """
    rows = (
        await db.execute(
            text("""
                SELECT
                    metric,
                    source_meta->>'hae_metric'                    AS hae_metric,
                    COUNT(*)                                       AS count,
                    MIN(ts)                                        AS earliest_ts,
                    MAX(ts)                                        AS latest_ts,
                    (array_agg(value ORDER BY ts DESC))[1]         AS latest_value
                FROM biometrics
                WHERE user_id = :uid
                  AND source = 'hae'
                GROUP BY metric, source_meta->>'hae_metric'
                ORDER BY metric, hae_metric
            """),
            {"uid": str(user.id)},
        )
    ).fetchall()

    stored: list[dict] = [
        {
            "internal_metric": r.metric,
            "hae_metric": r.hae_metric,
            "data_points": int(r.count),
            "earliest_ts": r.earliest_ts.isoformat() if r.earliest_ts else None,
            "latest_ts": r.latest_ts.isoformat() if r.latest_ts else None,
            "latest_value": r.latest_value,
        }
        for r in rows
    ]

    stored_internal_names: set[str] = {r["internal_metric"] for r in stored}

    return {
        "schema": {
            "standard_metrics": HAE_METRIC_MAP,
            "aggregate_metrics": {
                k: {
                    "internal_name": v[0],
                    "field_extracted": v[1],
                    "other_fields_available": sorted(
                        _AGGREGATE_UNUSED_FIELDS.get(k, frozenset())
                    ),
                }
                for k, v in HAE_AGGREGATE_MAP.items()
            },
            "sleep_sub_types": SLEEP_MAP,
            "sleep_v4_fields": {
                "InBed":  {"internal_name": "sleep_duration_min", "stored": True},
                "Asleep": {"internal_name": "sleep_asleep_min",   "stored": True},
                "Core":   {"internal_name": None,                 "stored": False},
                "Deep":   {"internal_name": None,                 "stored": False},
                "Rem":    {"internal_name": None,                 "stored": False},
                "Awake":  {"internal_name": None,                 "stored": False},
            },
        },
        "stored_metrics": stored,
        "known_internal_metrics_with_no_data": sorted(
            _ALL_INTERNAL_METRICS - stored_internal_names
        ),
        "unrecognised_internal_metrics_in_db": sorted(
            stored_internal_names - _ALL_INTERNAL_METRICS
        ),
    }


# ── POST: raw-payload analyser ────────────────────────────────────────────────

class AnalyzeRequest(BaseModel):
    payload: dict[str, Any]


@router.post("/settings/hae-diagnostic/analyze")
async def hae_diagnostic_analyze(body: AnalyzeRequest, user: CurrentUser) -> dict[str, Any]:
    """Analyse a raw HAE payload without storing it.

    For every metric block reports:
      - mapping status and target internal name(s)
      - all field keys present across data points
      - fields present but not currently extracted
      - likely name-misalignment or fuzzy suggestions for unmapped metrics
    """
    metrics_list: list[dict] = body.payload.get("data", {}).get("metrics", [])

    analysis: list[dict] = []
    unmapped_count = 0
    partial_extraction_count = 0

    for block in metrics_list:
        hae_name: str = block.get("name", "")
        units: str = block.get("units", "")
        data_points: list[dict] = block.get("data", [])

        # Collect every unique key seen across all data points.
        all_keys: set[str] = set()
        for pt in data_points:
            all_keys.update(pt.keys())

        # Present in a readable order: standard keys first, rest alphabetical.
        _std = ["date", "source", "qty"]
        sorted_keys = [k for k in _std if k in all_keys] + sorted(all_keys - set(_std))

        entry: dict[str, Any] = {
            "hae_name": hae_name,
            "units": units,
            "data_point_count": len(data_points),
            "fields_in_data": sorted_keys,
        }

        # ── classify the metric ───────────────────────────────────────────────
        if hae_name.startswith("sleep_analysis"):
            if "." in hae_name:
                sub = hae_name.split(".")[-1]
                internal = SLEEP_MAP.get(sub)
                if internal:
                    entry.update(status="mapped", internal_names=[internal], fields_not_extracted=[])
                else:
                    entry.update(status="unmapped", internal_names=[], fields_not_extracted=[])
                    unmapped_count += 1
            else:
                has_v4_fields = any("InBed" in pt for pt in data_points)
                if has_v4_fields:
                    unused = sorted(_SLEEP_V4_UNUSED_FIELDS & all_keys)
                    entry.update(
                        status="sleep_v4_partial",
                        internal_names=["sleep_duration_min", "sleep_asleep_min"],
                        fields_not_extracted=unused,
                    )
                    if unused:
                        partial_extraction_count += 1
                else:
                    entry.update(
                        status="sleep_legacy",
                        internal_names=["sleep_duration_min"],
                        fields_not_extracted=[],
                    )

        elif hae_name in HAE_AGGREGATE_MAP:
            internal_name, field_used = HAE_AGGREGATE_MAP[hae_name]
            unused = sorted(_AGGREGATE_UNUSED_FIELDS.get(hae_name, frozenset()) & all_keys)
            entry.update(
                status="mapped",
                internal_names=[internal_name],
                field_extracted=field_used,
                fields_not_extracted=unused,
            )
            if unused:
                partial_extraction_count += 1

        elif hae_name in HAE_METRIC_MAP:
            entry.update(
                status="mapped",
                internal_names=[HAE_METRIC_MAP[hae_name]],
                fields_not_extracted=[],
            )

        else:
            unmapped_count += 1
            misalign = _misalignment_match(hae_name)
            entry.update(status="unmapped", internal_names=[], fields_not_extracted=[])
            if misalign:
                entry["likely_misalignment"] = misalign
                entry["misalignment_reason"] = "normalises to a known HAE metric name"
            else:
                suggestions = _fuzzy_suggestions(hae_name)
                if suggestions:
                    entry["suggestions"] = suggestions

        analysis.append(entry)

    mapped_count = len(analysis) - unmapped_count

    return {
        "metrics_in_payload": len(analysis),
        "metrics_mapped": mapped_count,
        "metrics_unmapped": unmapped_count,
        "metrics_with_unextracted_fields": partial_extraction_count,
        "analysis": analysis,
    }
