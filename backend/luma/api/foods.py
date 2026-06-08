from typing import List, Optional, Dict, Any
from uuid import UUID
import re
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from luma.db.models import Food
from luma.deps import DbDep, CurrentUser
from luma.services import off_client, usda_client
from luma.services.food_flags import merge_flags

router = APIRouter()

# Minimum local hits before we skip the live USDA fallback.
_LOCAL_THRESHOLD = 5


class FoodCreate(BaseModel):
    name: str
    brand: Optional[str] = None
    serving_size_g: float
    nutrients_per_100g: Dict[str, Any]
    tags: Optional[List[str]] = None


class FoodResponse(BaseModel):
    id: UUID
    source: str
    source_id: Optional[str] = None
    name: str
    brand: Optional[str] = None
    serving_size_g: Optional[float] = None
    nutrients_per_100g: Dict[str, Any]
    tags: Optional[List[str]] = None
    flags: List[str] = []
    created_by: Optional[UUID] = None

    model_config = {"from_attributes": True}


def get_search_terms(q: str) -> List[str]:
    q_clean = q.strip().lower()
    candidates = [q_clean]

    # For multi-word queries also emit individual tokens so that e.g.
    # "steak top" matches "Beef Sirloin Steak (Lean, Cooked)" via the
    # individual word "steak", allowing the reference-food boost to apply.
    words = q_clean.split()
    if len(words) > 1:
        candidates.extend(words)

    # Simple singularization for each candidate
    expanded: List[str] = []
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


@router.get("/search", response_model=List[FoodResponse])
async def search_foods(
    db: DbDep,
    current_user: CurrentUser,
    q: Optional[str] = Query(None, min_length=1),
    flags: Optional[str] = Query(None, description="Comma-separated flag list (AND logic)"),
) -> List[Food]:
    # USDA reference foods surface first — they are curated, normalised to 100g,
    # and carry the full nutrient profile the agents depend on.
    _no_q_order = case(
        (Food.brand == "USDA Reference", 0),
        (Food.source == "user", 1),
        (Food.source == "usda", 2),
        else_=3
    )

    flag_list = [f.strip() for f in flags.split(",") if f.strip()] if flags else []

    def _apply_flag_filters(s):
        for flag in flag_list:
            s = s.where(Food.flags.contains([flag]))
        return s

    if not q or not q.strip():
        stmt = _apply_flag_filters(
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
    _user_boost = case((Food.source == "user", 0.5), else_=0.0)
    _usda_boost = case((Food.source == "usda", 0.1), else_=0.0)

    stmt = _apply_flag_filters(
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
    food = Food(
        id=uuid.uuid4(),
        source="off",
        source_id=source_id,
        name=off_data["name"],
        brand=off_data.get("brand"),
        serving_size_g=off_data["serving_size_g"],
        nutrients_per_100g=off_data["nutrients_per_100g"],
        tags=off_data.get("tags", []),
        flags=off_data.get("flags", []),
        created_by=None,
    )
    db.add(food)
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
