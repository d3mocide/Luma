"""Resolve LLM-identified meal items to measured nutrients from the foods DB.

The LLM identifies *what* was eaten (name, quantity, grams); we trust the
curated foods table / USDA reference for the actual nutrient values, falling
back to the LLM estimate only when there is no confident match. Precision-first:
a wrong substitution is worse than an honestly-tagged estimate.

Each resolved item gains a ``nutrient_source`` field:
``"reference" | "usda" | "user" | "off"`` for DB-sourced nutrients, or
``"estimate"`` when the LLM's own values were kept.
"""
from __future__ import annotations

import logging
import re
from difflib import SequenceMatcher
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from luma.agents.food_extractor import sanitize_extracted_items
from luma.db.models import Food
from luma.services.food_search import LOCAL_THRESHOLD, fetch_and_cache_usda, rank_local_foods
from luma.services.nutrition import scale_nutrients

logger = logging.getLogger("food_resolver")

# Precision-first acceptance. A candidate is confident when its name is a
# near-exact match, or contains every identified word as a whole word without
# being a substantially different (longer) food.
_STRONG_RATIO = 0.82
_MAX_EXTRA_WORDS = 2


def _normalize(name: str) -> str:
    n = re.sub(r"[^a-z0-9\s]", " ", name.strip().lower())
    return re.sub(r"\s+", " ", n).strip()


def _is_confident(item_name: str, candidate_name: str) -> bool:
    a = _normalize(item_name)
    b = _normalize(candidate_name)
    if not a or not b:
        return False
    if SequenceMatcher(None, a, b).ratio() >= _STRONG_RATIO:
        return True
    item_words = set(a.split())
    cand_words = set(b.split())
    # Every identified word is present as a whole word in the candidate, and the
    # candidate adds only a few descriptors — guards "almond milk latte" from
    # collapsing onto "almond milk" (item has an extra word the candidate lacks),
    # while still mapping "almond milk" -> "almond milk, unsweetened".
    if item_words and item_words <= cand_words and len(cand_words - item_words) <= _MAX_EXTRA_WORDS:
        return True
    return False


def _pick_confident(name: str, ranked: list[tuple[Food, float]]) -> Food | None:
    for food, _score in ranked:
        if _is_confident(name, food.name):
            return food
    return None


async def _best_match(db: AsyncSession, name: str, *, allow_live: bool) -> Food | None:
    ranked = await rank_local_foods(db, name, limit=5)
    match = _pick_confident(name, ranked)
    if match is not None:
        return match
    # Local miss — optionally pull the food from USDA, cache it, and re-rank.
    if allow_live and len(ranked) < LOCAL_THRESHOLD:
        try:
            got = await fetch_and_cache_usda(db, name)
        except Exception:
            logger.warning("USDA fallback failed for %r", name, exc_info=True)
            return None
        if got:
            ranked = await rank_local_foods(db, name, limit=5)
            match = _pick_confident(name, ranked)
    return match


async def _resolve_one(db: AsyncSession, item: dict[str, Any], *, allow_live: bool) -> None:
    name = (item.get("name") or "").strip()
    if not name:
        item["nutrient_source"] = "estimate"
        return

    food = await _best_match(db, name, allow_live=allow_live)
    if food is None:
        item["nutrient_source"] = "estimate"
        return

    grams = float(item.get("estimated_weight_g") or 0.0)
    if grams <= 0:
        grams = float(food.serving_size_g or 100.0)
        item["estimated_weight_g"] = grams

    item["nutrients"] = scale_nutrients(food.nutrients_per_100g or {}, grams)
    item["food_id"] = str(food.id)
    item["nutrient_source"] = "reference" if food.brand == "USDA Reference" else food.source


async def resolve_items(
    db: AsyncSession,
    items: list[Any],
    *,
    allow_live: bool = True,
) -> list[Any]:
    """Resolve each extracted item against the foods DB, in place.

    Items are processed sequentially on the shared AsyncSession (never via
    asyncio.gather — see CLAUDE.md). Returns the same list after clamping the
    fat sub-components on any items that fell back to LLM estimates.
    """
    for item in items:
        if not isinstance(item, dict):
            continue
        await _resolve_one(db, item, allow_live=allow_live)
    return sanitize_extracted_items(items)
