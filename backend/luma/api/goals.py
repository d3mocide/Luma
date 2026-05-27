import logging
from typing import Any, Literal

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert

from luma.db.models import Goal, Preference
from luma.deps import CurrentUser, DbDep
from luma.services.llm_metrics import tracker as llm_metrics_tracker

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
    await db.execute(
        delete(Preference).where(
            Preference.user_id == user.id,
            Preference.kind == kind,
            Preference.value == value,
        )
    )
    await db.commit()
    return {"detail": "deleted"}


MEASUREMENT_PREF_KIND = "measurement_system"
MEASUREMENT_SYSTEMS = ("metric", "imperial")


class MeasurementSettingsOut(BaseModel):
    system: Literal["metric", "imperial"]


class MeasurementSettingsIn(BaseModel):
    system: Literal["metric", "imperial"]


@router.get("/settings/measurements", response_model=MeasurementSettingsOut)
async def get_measurement_settings(user: CurrentUser, db: DbDep) -> MeasurementSettingsOut:
    result = await db.execute(
        select(Preference.value).where(
            Preference.user_id == user.id,
            Preference.kind == MEASUREMENT_PREF_KIND,
            Preference.value.in_(MEASUREMENT_SYSTEMS),
        )
    )
    system = result.scalar_one_or_none() or "metric"
    return MeasurementSettingsOut(system=system)


@router.put("/settings/measurements", response_model=MeasurementSettingsOut)
async def put_measurement_settings(
    body: MeasurementSettingsIn,
    user: CurrentUser,
    db: DbDep,
) -> MeasurementSettingsOut:
    await db.execute(
        delete(Preference).where(
            Preference.user_id == user.id,
            Preference.kind == MEASUREMENT_PREF_KIND,
        )
    )
    db.add(Preference(user_id=user.id, kind=MEASUREMENT_PREF_KIND, value=body.system))
    await db.commit()
    return MeasurementSettingsOut(system=body.system)


@router.get("/settings/llm-metrics")
async def get_llm_metrics(user: CurrentUser) -> dict[str, Any]:
    return await llm_metrics_tracker.snapshot()
