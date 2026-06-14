import re
import uuid
from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import case, func, or_, select
from sqlalchemy import text as sa_text

from luma.db.models import Food
from luma.deps import CurrentUser, DbDep
from luma.services import off_client, usda_client
from luma.services.food_flags import compute_threshold_flags, merge_flags

router = APIRouter()

# Minimum local hits before we skip the live USDA fallback.
_LOCAL_THRESHOLD = 5

# Extended nutrients that OFF frequently omits for US branded packaged foods.
# When more than half are absent the barcode endpoint attempts a USDA enrichment.
_EXTENDED_NUTRIENT_KEYS: frozenset[str] = frozenset({
    "monounsaturated_fat_g", "polyunsaturated_fat_g", "trans_fat_g", "cholesterol_mg",
    "vitamin_a_mcg", "vitamin_c_mg", "vitamin_d_mcg", "vitamin_e_mg", "vitamin_k_mcg",
    "thiamin_mg", "riboflavin_mg", "niacin_mg", "vitamin_b6_mg", "folate_mcg",
    "vitamin_b12_mcg", "calcium_mg", "iron_mg", "magnesium_mg", "phosphorus_mg",
    "zinc_mg", "selenium_mcg",
})


class FoodCreate(BaseModel):
    name: str
    brand: str | None = None
    serving_size_g: float
    nutrients_per_100g: dict[str, Any]
    tags: list[str] | None = None


class FoodResponse(BaseModel):
    id: UUID
    source: str
    source_id: str | None = None
    name: str
    brand: str | None = None
    serving_size_g: float | None = None
    nutrients_per_100g: dict[str, Any]
    household_measures: list[dict[str, Any]] = []
    category: str | None = None
    tags: list[str] | None = None
    flags: list[str] = []
    created_by: UUID | None = None

    model_config = {"from_attributes": True}


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


@router.get("/search", response_model=list[FoodResponse])
async def search_foods(
    db: DbDep,
    current_user: CurrentUser,
    q: str | None = Query(None, min_length=1),
    flags: str | None = Query(None, description="Comma-separated flag list (AND logic)"),
    category: str | None = Query(None, description="Browse a single food-group category"),
) -> list[Food]:
    # USDA reference foods surface first — they are curated, normalised to 100g,
    # and carry the full nutrient profile the agents depend on.
    _no_q_order = case(
        (Food.brand == "USDA Reference", 0),
        (Food.source == "user", 1),
        (Food.source == "usda", 2),
        else_=3
    )

    flag_list = [f.strip() for f in flags.split(",") if f.strip()] if flags else []
    category = category.strip() if category and category.strip() else None

    def _apply_filters(s):
        for flag in flag_list:
            s = s.where(Food.flags.contains([flag]))
        if category:
            s = s.where(Food.category == category)
        return s

    # Category browse: list the whole curated group (no text query), reference
    # foods first then alphabetical. A higher limit so the full group is visible.
    if category and (not q or not q.strip()):
        stmt = _apply_filters(
            select(Food).order_by(_no_q_order, Food.name).limit(100)
        )
        res = await db.execute(stmt)
        return list(res.scalars().all())

    if not q or not q.strip():
        stmt = _apply_filters(
            select(Food).order_by(_no_q_order, Food.name).limit(30)
        )
        res = await db.execute(stmt)
        return list(res.scalars().all())

    q_clean = q.strip()
    terms = get_search_terms(q_clean)
    _sim = func.similarity(Food.name, q_clean)
    
    # Substring conditions to ensure high-fidelity hits are captured
    where_conds = [
        _sim > 0.15,
        func.similarity(func.coalesce(Food.brand, ""), q_clean) > 0.15,
    ]
    for term in terms:
        where_conds.append(Food.name.ilike(f"%{term}%"))

    # Word boundary regex conditions for exact word matching
    word_match_conds = [Food.name.op("~*")(f"\\y{term}\\y") for term in terms]
    substring_match_conds = [Food.name.ilike(f"%{term}%") for term in terms]

    _match_boost = case(
        (or_(*word_match_conds), 2.0),
        (or_(*substring_match_conds), 0.5),
        else_=0.0
    )
    _ref_boost = case((Food.brand == "USDA Reference", 1.5), else_=0.0)
    _user_boost = case((Food.source == "user", 2.0), else_=0.0)
    _usda_boost = case((Food.source == "usda", 0.1), else_=0.0)

    stmt = _apply_filters(
        select(Food)
        .where(or_(*where_conds))
        .order_by((_sim + _match_boost + _ref_boost + _user_boost + _usda_boost).desc())
        .limit(30)
    )
    res = await db.execute(stmt)
    local: list[Food] = list(res.scalars().all())

    if len(local) >= _LOCAL_THRESHOLD:
        return local

    # Sparse local results — hit USDA FoodData Central and cache any new foods.
    remote = await usda_client.search_foods(q_clean, limit=20)
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

    # Re-query so the caller gets a consistent, ranked result set from the DB.
    res2 = await db.execute(stmt)
    return list(res2.scalars().all())


@router.get("/barcode/{barcode}", response_model=FoodResponse)
async def lookup_barcode_food(
    barcode: str,
    db: DbDep,
    current_user: CurrentUser,
) -> Food:
    source_id = f"off_{barcode}"
    stmt = select(Food).where(Food.source_id == source_id)
    res = await db.execute(stmt)
    food = res.scalar_one_or_none()
    if food:
        return food

    off_data = await off_client.lookup_barcode(barcode)
    if not off_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Product not found. Try scanning a packaged food barcode.",
        )

    # Enrich sparse OFF data with USDA Branded Foods nutrient panel.
    # OFF often omits extended fats, cholesterol, vitamins, and minerals for US
    # packaged goods. USDA FDC Branded Foods carries the full nutrition label for
    # many of the same products. We do this once on first scan; the result is
    # cached in the foods table so subsequent scans are instant.
    off_nutrients = off_data["nutrients_per_100g"]
    missing = sum(1 for k in _EXTENDED_NUTRIENT_KEYS if not off_nutrients.get(k))
    if missing >= len(_EXTENDED_NUTRIENT_KEYS) // 2:
        usda_nutrients = await usda_client.search_by_upc(barcode)
        if usda_nutrients:
            merged = False
            for k in _EXTENDED_NUTRIENT_KEYS:
                if not off_nutrients.get(k) and usda_nutrients.get(k):
                    off_nutrients[k] = usda_nutrients[k]
                    merged = True
            if merged:
                off_data["flags"] = compute_threshold_flags(off_nutrients)

    food = Food(
        id=uuid.uuid4(),
        source="off",
        source_id=source_id,
        name=off_data["name"],
        brand=off_data.get("brand"),
        serving_size_g=off_data["serving_size_g"],
        nutrients_per_100g=off_nutrients,
        household_measures=off_data.get("household_measures", []),
        tags=off_data.get("tags", []),
        flags=off_data.get("flags", []),
        created_by=None,
    )
    db.add(food)
    await db.commit()
    await db.refresh(food)
    return food


@router.get("/recent", response_model=list[FoodResponse])
async def get_recent_foods(
    db: DbDep,
    current_user: CurrentUser,
    limit: int = Query(default=12, le=30),
) -> list[Food]:
    """Return the user's most recently added or scanned foods.

    Two sources are merged:
    - User-created foods (photo-extracted and manual) ordered by created_at.
    - Foods referenced via food_id in the user's meal event items JSONB
      (barcode / search items that carried a food_id forward).
    """
    # 1. User-created foods (covers photo-extracted items after auto-persist)
    user_res = await db.execute(
        select(Food)
        .where(Food.created_by == current_user.id, Food.source == "user")
        .order_by(Food.created_at.desc())
        .limit(limit)
    )
    user_foods: list[Food] = list(user_res.scalars().all())
    user_food_ids = {f.id for f in user_foods}

    # 2. Recently used barcode/search foods from meal event JSONB items.
    #    Only foods that had food_id stamped on them (post this feature rollout).
    remaining = limit - len(user_foods)
    scan_foods: list[Food] = []
    if remaining > 0:
        raw = await db.execute(
            sa_text("""
                SELECT DISTINCT ON (f.id) f.id
                FROM meal_events me
                CROSS JOIN LATERAL jsonb_array_elements(me.items) AS elem(item)
                JOIN foods f ON f.id = (elem.item->>'food_id')::uuid
                WHERE me.user_id = :user_id
                  AND elem.item->>'food_id' IS NOT NULL
                  AND f.source IN ('off', 'usda')
                ORDER BY f.id, me.ts DESC
                LIMIT :lim
            """),
            {"user_id": current_user.id, "lim": remaining * 2},
        )
        scanned_ids = [row[0] for row in raw if row[0] not in user_food_ids][:remaining]
        if scanned_ids:
            scan_res = await db.execute(select(Food).where(Food.id.in_(scanned_ids)))
            scan_foods = list(scan_res.scalars().all())

    return user_foods + scan_foods


@router.post("/{food_id}/enrich", response_model=FoodResponse)
async def enrich_food(
    food_id: UUID,
    db: DbDep,
    current_user: CurrentUser,
) -> Food:
    """Lazily pull a USDA food's full detail (household portions + complete
    nutrients) the first time it's selected, then cache it on the row."""
    res = await db.execute(select(Food).where(Food.id == food_id))
    food = res.scalar_one_or_none()
    if not food:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Food not found")

    if food.detail_enriched or food.source != "usda" or not (food.source_id or "").startswith("fdc_"):
        return food

    fdc_id = (food.source_id or "")[len("fdc_"):]
    detail = await usda_client.get_food_detail(fdc_id)
    if detail:
        food.household_measures = detail.get("household_measures", [])
        new_nutrients = detail.get("nutrients_per_100g") or {}
        # Only overwrite nutrients if the detail call returned a usable profile.
        if new_nutrients.get("calories"):
            food.nutrients_per_100g = new_nutrients
            food.flags = merge_flags(detail.get("flags", []), new_nutrients)
        if detail.get("serving_size_g"):
            food.serving_size_g = detail["serving_size_g"]
    # Mark enriched even on a miss so we don't refetch a portion-less food.
    food.detail_enriched = True
    await db.commit()
    await db.refresh(food)
    return food


@router.get("/{food_id}", response_model=FoodResponse)
async def get_food(
    food_id: UUID,
    db: DbDep,
    current_user: CurrentUser,
) -> Food:
    stmt = select(Food).where(Food.id == food_id)
    res = await db.execute(stmt)
    food = res.scalar_one_or_none()
    if not food:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Food not found",
        )
    return food


@router.post("", response_model=FoodResponse, status_code=status.HTTP_201_CREATED)
async def create_food(
    food_in: FoodCreate,
    db: DbDep,
    current_user: CurrentUser,
) -> Food:
    new_food = Food(
        id=uuid.uuid4(),
        source="user",
        name=food_in.name,
        brand=food_in.brand,
        serving_size_g=food_in.serving_size_g,
        nutrients_per_100g=food_in.nutrients_per_100g,
        tags=food_in.tags or [],
        created_by=current_user.id,
    )
    db.add(new_food)
    await db.commit()
    await db.refresh(new_food)
    return new_food
