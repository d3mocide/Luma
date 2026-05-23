import logging
from datetime import timezone
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert

from lumo.db.models import Goal, Preference
from lumo.deps import CurrentUser, DbDep

logger = logging.getLogger(__name__)
router = APIRouter()


class GoalIn(BaseModel):
    target_weight_kg: float | None = None
    target_ldl_mg_dl: int | None = None
    current_ldl_mg_dl: int | None = None
    current_ldl_drawn_at: str | None = None
    daily_calorie_target: int | None = None
    daily_sat_fat_g_max: float | None = None
    daily_soluble_fiber_g: float | None = None
    daily_protein_g_min: float | None = None
    dietary_pattern: str | None = None


@router.get("/goals")
async def get_goals(user: CurrentUser, db: DbDep) -> dict[str, Any]:
    result = await db.execute(select(Goal).where(Goal.user_id == user.id))
    goal = result.scalar_one_or_none()
    if not goal:
        return {}
    return {
        "target_weight_kg": goal.target_weight_kg,
        "target_ldl_mg_dl": goal.target_ldl_mg_dl,
        "current_ldl_mg_dl": goal.current_ldl_mg_dl,
        "current_ldl_drawn_at": goal.current_ldl_drawn_at.isoformat() if goal.current_ldl_drawn_at else None,
        "daily_calorie_target": goal.daily_calorie_target,
        "daily_sat_fat_g_max": goal.daily_sat_fat_g_max,
        "daily_soluble_fiber_g": goal.daily_soluble_fiber_g,
        "daily_protein_g_min": goal.daily_protein_g_min,
        "dietary_pattern": goal.dietary_pattern,
    }


@router.put("/goals")
async def put_goals(body: GoalIn, user: CurrentUser, db: DbDep) -> dict[str, Any]:
    values = body.model_dump(exclude_none=False)
    values["user_id"] = user.id

    stmt = insert(Goal).values(**values)
    stmt = stmt.on_conflict_do_update(
        index_elements=["user_id"],
        set_={k: v for k, v in values.items() if k != "user_id"},
    )
    await db.execute(stmt)
    await db.commit()
    return await get_goals(user, db)


class PrefIn(BaseModel):
    kind: str
    value: str


@router.get("/preferences")
async def get_preferences(user: CurrentUser, db: DbDep) -> list[dict]:
    result = await db.execute(select(Preference).where(Preference.user_id == user.id))
    return [{"kind": p.kind, "value": p.value} for p in result.scalars()]


@router.post("/preferences")
async def add_preference(body: PrefIn, user: CurrentUser, db: DbDep) -> dict:
    pref = Preference(user_id=user.id, kind=body.kind, value=body.value)
    db.add(pref)
    await db.commit()
    return {"kind": pref.kind, "value": pref.value}


@router.delete("/preferences/{kind}/{value}")
async def delete_preference(kind: str, value: str, user: CurrentUser, db: DbDep) -> dict:
    from sqlalchemy import delete
    await db.execute(
        delete(Preference).where(
            Preference.user_id == user.id,
            Preference.kind == kind,
            Preference.value == value,
        )
    )
    await db.commit()
    return {"detail": "deleted"}
