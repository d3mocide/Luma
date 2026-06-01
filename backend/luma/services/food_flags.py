"""Food flag taxonomy and computation — Phase 3.

Curated flags are set in seed data and managed by humans.
Threshold flags are auto-computed from per-100g nutrient values.
"""
from __future__ import annotations

from typing import Sequence

# (flag_name, nutrient_key, threshold, comparison)
_AUTO_FLAG_RULES: list[tuple[str, str, float, str]] = [
    ("high-fiber",         "fiber_g",         5.0,   "gte"),
    ("high-protein",       "protein_g",       20.0,  "gte"),
    ("low-sodium",         "sodium_mg",       140.0, "lte"),
    ("high-saturated-fat", "saturated_fat_g", 5.0,   "gt"),
    ("high-sodium",        "sodium_mg",       400.0, "gt"),
    ("high-sugar",         "sugars_g",        12.5,  "gt"),
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


def compute_threshold_flags(nutrients: dict[str, float]) -> list[str]:
    """Return auto-computed flags derived from per-100g nutrient values."""
    flags: list[str] = []
    for flag_name, key, threshold, cmp in _AUTO_FLAG_RULES:
        val = nutrients.get(key)
        if val is None:
            continue
        if cmp == "gte" and val >= threshold:
            flags.append(flag_name)
        elif cmp == "lte" and val <= threshold:
            flags.append(flag_name)
        elif cmp == "gt" and val > threshold:
            flags.append(flag_name)
    return flags


def merge_flags(curated: Sequence[str], nutrients: dict[str, float]) -> list[str]:
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
