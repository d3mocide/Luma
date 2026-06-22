"""Shared local food ranking and USDA caching.

Extracted from the ``/foods/search`` endpoint so the search route and the meal
resolver apply the *identical* scoring formula. The ranking invariants
documented in CLAUDE.md ("Food Search Ranking") live here now — do not fork
them. Key points preserved:

- ``get_search_terms`` tokenizes multi-word queries into individual words in
  addition to the full phrase.
- Score formula: ``similarity + match_boost + ref_boost + user_boost + usda_boost``.
- ``LOCAL_THRESHOLD`` gates the live USDA fallback.
"""
from __future__ import annotations

import re
import uuid

from sqlalchemy import case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.selectable import Select

from luma.db.models import Food
from luma.services import usda_client
from luma.services.food_flags import merge_flags

# Minimum local hits before we skip the live USDA fallback.
LOCAL_THRESHOLD = 5

_SIM_FLOOR = 0.15


def get_search_terms(q: str) -> list[str]:
    q_clean = q.strip().lower()
    candidates = [q_clean]

    # For multi-word queries also emit individual tokens so that e.g.
    # "steak top" matches "Beef Sirloin Steak (Lean, Cooked)" via the
    # individual word "steak", allowing the reference-food boost to apply.
    words = q_clean.split()
    if len(words) > 1:
        candidates.extend(words)

    # Simple singularization for each candidate
    expanded: list[str] = []
    for t in candidates:
        expanded.append(t)
        if t.endswith("s") and len(t) > 3:
            if t.endswith("es") and len(t) > 4:
                expanded.append(t[:-2])
                expanded.append(t[:-1])
            else:
                expanded.append(t[:-1])

    # Clean terms for safe regular expressions (alphanumeric, spaces, hyphens, and apostrophes)
    cleaned_terms = []
    for t in expanded:
        cleaned = re.sub(r"[^a-zA-Z0-9\s\-\']", "", t)
        cleaned = re.sub(r"\s+", " ", cleaned).strip()
        if cleaned:
            cleaned_terms.append(cleaned)

    if not cleaned_terms:
        cleaned_terms = [q_clean]

    return list(dict.fromkeys(cleaned_terms))


def _where_conds(q_clean: str, terms: list[str]) -> list:
    _sim = func.similarity(Food.name, q_clean)
    conds = [
        _sim > _SIM_FLOOR,
        func.similarity(func.coalesce(Food.brand, ""), q_clean) > _SIM_FLOOR,
    ]
    for term in terms:
        conds.append(Food.name.ilike(f"%{term}%"))
    return conds


def _score_expr(q_clean: str, terms: list[str]):
    _sim = func.similarity(Food.name, q_clean)
    word_match_conds = [Food.name.op("~*")(f"\\y{term}\\y") for term in terms]
    substring_match_conds = [Food.name.ilike(f"%{term}%") for term in terms]
    _match_boost = case(
        (or_(*word_match_conds), 2.0),
        (or_(*substring_match_conds), 0.5),
        else_=0.0,
    )
    _ref_boost = case((Food.brand == "USDA Reference", 1.5), else_=0.0)
    _user_boost = case((Food.source == "user", 2.0), else_=0.0)
    _usda_boost = case((Food.source == "usda", 0.1), else_=0.0)
    return _sim + _match_boost + _ref_boost + _user_boost + _usda_boost


def ranked_text_query(q_clean: str, *, limit: int = 30) -> Select:
    """Ranked ``select(Food)`` for a text query (scalars only — used by /search)."""
    terms = get_search_terms(q_clean)
    return (
        select(Food)
        .where(or_(*_where_conds(q_clean, terms)))
        .order_by(_score_expr(q_clean, terms).desc())
        .limit(limit)
    )


async def rank_local_foods(db: AsyncSession, q_clean: str, *, limit: int = 5) -> list[tuple[Food, float]]:
    """Ranked foods *with* their score, so callers can judge match confidence."""
    terms = get_search_terms(q_clean)
    score = _score_expr(q_clean, terms).label("score")
    stmt = (
        select(Food, score)
        .where(or_(*_where_conds(q_clean, terms)))
        .order_by(score.desc())
        .limit(limit)
    )
    res = await db.execute(stmt)
    return [(row[0], float(row[1])) for row in res.all()]


async def fetch_and_cache_usda(db: AsyncSession, q_clean: str, *, limit: int = 20) -> bool:
    """Pull live USDA results and cache any new foods. Returns True if results came back."""
    remote = await usda_client.search_foods(q_clean, limit=limit)
    for item in remote:
        if not item.get("source_id"):
            continue
        exists = await db.execute(select(Food).where(Food.source_id == item["source_id"]))
        if exists.scalar_one_or_none():
            continue
        new_flags = merge_flags(item.get("flags", []), item.get("nutrients_per_100g", {}))
        db.add(Food(id=uuid.uuid4(), flags=new_flags, **{k: v for k, v in item.items() if k != "flags"}))
    if remote:
        await db.commit()
    return bool(remote)
