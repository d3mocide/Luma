"""Food flag taxonomy and computation — Phase 3.

Curated flags are set in seed data and managed by humans.
Threshold flags are auto-computed from per-100g nutrient values.
"""
from __future__ import annotations

from collections.abc import Sequence

# Single-nutrient threshold flags — (flag_name, nutrient_key, threshold, operator)
# Operators: "gte" (>=), "lte" (<=), "gt" (>), "lt" (<)
_AUTO_FLAG_RULES: list[tuple[str, str, float, str]] = [
    ("high-fiber",         "fiber_g",         5.0,   "gte"),
    ("high-protein",       "protein_g",       20.0,  "gte"),
    ("low-sodium",         "sodium_mg",       140.0, "lte"),
    ("high-saturated-fat", "saturated_fat_g", 5.0,   "gt"),
    ("high-sodium",        "sodium_mg",       400.0, "gt"),
    ("high-sugar",         "sugars_g",        12.5,  "gt"),
]

# Compound AND flags — every condition in the list must be satisfied.
# Format: (flag_name, [(nutrient_key, threshold, operator), ...])
#
# inflammatory: high sat fat + high sugar + low fiber is the classic Western
#   pro-inflammatory pattern. All three must be true so olive oil (high sat fat,
#   no sugar) and nuts (high fat, high fiber) are not mislabelled.
#
# processed: very high sodium combined with essentially no fiber is a reliable
#   proxy for heavily processed products. The 1000 mg bar avoids flagging
#   moderately salty whole foods. Omega-6/omega-3 ratios are not available in
#   USDA or OFF nutrient payloads, so sodium + fiber is the best available signal.
_COMPOUND_FLAG_RULES: list[tuple[str, list[tuple[str, float, str]]]] = [
    (
        "inflammatory",
        [
            ("saturated_fat_g", 5.0,    "gt"),
            ("sugars_g",        10.0,   "gt"),
            ("fiber_g",         2.0,    "lt"),
        ],
    ),
    (
        "processed",
        [
            ("sodium_mg",  1000.0, "gt"),
            ("fiber_g",    1.0,    "lt"),
        ],
    ),
]

VALID_FLAGS = frozenset({
    "heart-healthy",
    "anti-inflammatory",
    "gluten-free",
    "keto-friendly",
    "high-fiber",
    "high-protein",
    "low-sodium",
    "high-saturated-fat",
    "high-sodium",
    "high-sugar",
    "inflammatory",
    "processed",
})

POSITIVE_FLAGS = frozenset({
    "heart-healthy",
    "anti-inflammatory",
    "gluten-free",
    "keto-friendly",
    "high-fiber",
    "high-protein",
    "low-sodium",
})

NEGATIVE_FLAGS = frozenset({
    "high-saturated-fat",
    "high-sodium",
    "high-sugar",
    "inflammatory",
    "processed",
})


def _check(val: float, threshold: float, op: str) -> bool:
    if op == "gte":
        return val >= threshold
    if op == "lte":
        return val <= threshold
    if op == "gt":
        return val > threshold
    if op == "lt":
        return val < threshold
    return False


def compute_threshold_flags(nutrients: dict[str, float | None]) -> list[str]:
    """Return auto-computed flags derived from per-100g nutrient values."""
    flags: list[str] = []

    for flag_name, key, threshold, op in _AUTO_FLAG_RULES:
        val = nutrients.get(key)
        if val is not None and _check(val, threshold, op):
            flags.append(flag_name)

    for flag_name, conditions in _COMPOUND_FLAG_RULES:
        if all(
            (v := nutrients.get(key)) is not None and _check(v, threshold, op)
            for key, threshold, op in conditions
        ):
            flags.append(flag_name)

    return flags


def merge_flags(curated: Sequence[str], nutrients: dict[str, float | None]) -> list[str]:
    """Merge curated flags with auto-computed threshold flags.

    Returns a deduplicated, sorted list. Unknown curated flags are silently
    dropped to keep the taxonomy clean.
    """
    seen: set[str] = set()
    result: list[str] = []

    for f in curated:
        if f in VALID_FLAGS and f not in seen:
            seen.add(f)
            result.append(f)

    for f in compute_threshold_flags(nutrients):
        if f not in seen:
            seen.add(f)
            result.append(f)

    return sorted(result)
