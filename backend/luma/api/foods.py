from typing import List, Optional, Dict, Any
from uuid import UUID
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from luma.db.models import Food
from luma.deps import DbDep, CurrentUser

router = APIRouter()


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
    created_by: Optional[UUID] = None

    class Config:
        from_attributes = True


@router.get("/search", response_model=List[FoodResponse])
async def search_foods(
    db: DbDep,
    current_user: CurrentUser,
    q: Optional[str] = Query(None, min_length=1),
) -> List[Food]:
    if not q or not q.strip():
        stmt = select(Food).order_by(Food.name).limit(30)
    else:
        q_clean = q.strip()
        # Combine pg_trgm similarity and standard substring ILIKE for ultimate fuzzy robust matching
        stmt = (
            select(Food)
            .where(
                or_(
                    func.similarity(Food.name, q_clean) > 0.15,
                    func.similarity(func.coalesce(Food.brand, ""), q_clean) > 0.15,
                    Food.name.ilike(f"%{q_clean}%"),
                )
            )
            .order_by(func.similarity(Food.name, q_clean).desc())
            .limit(30)
        )

    res = await db.execute(stmt)
    return list(res.scalars().all())


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
