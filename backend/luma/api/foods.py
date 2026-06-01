from typing import List, Optional, Dict, Any
from uuid import UUID
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from luma.db.models import Food
from luma.deps import DbDep, CurrentUser
from luma.services import usda_client
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
    _sim = func.similarity(Food.name, q_clean)
    _ref_boost = case((Food.brand == "USDA Reference", 1.5), else_=0.0)
    _user_boost = case((Food.source == "user", 0.5), else_=0.0)
    _usda_boost = case((Food.source == "usda", 0.1), else_=0.0)
    stmt = _apply_flag_filters(
        select(Food)
        .where(
            or_(
                _sim > 0.15,
                func.similarity(func.coalesce(Food.brand, ""), q_clean) > 0.15,
                Food.name.ilike(f"%{q_clean}%"),
            )
        )
        .order_by((_sim + _ref_boost + _user_boost + _usda_boost).desc())
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
