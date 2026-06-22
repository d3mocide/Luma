import uuid
from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import case, select
from sqlalchemy import text as sa_text

from luma.db.models import Food
from luma.deps import CurrentUser, DbDep
from luma.services import off_client, usda_client
from luma.services.food_flags import compute_threshold_flags, merge_flags
from luma.services.food_search import (
    LOCAL_THRESHOLD,
    fetch_and_cache_usda,
    get_search_terms,  # noqa: F401 — re-exported; ranking invariants documented in CLAUDE.md
    ranked_text_query,
)

router = APIRouter()

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
    stmt = _apply_filters(ranked_text_query(q_clean, limit=30))
    res = await db.execute(stmt)
    local: list[Food] = list(res.scalars().all())

    if len(local) >= LOCAL_THRESHOLD:
        return local

    # Sparse local results — hit USDA FoodData Central and cache any new foods.
    await fetch_and_cache_usda(db, q_clean)

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
