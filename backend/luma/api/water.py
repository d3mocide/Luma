import uuid
from datetime import UTC, datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from luma.config import settings
from luma.db.models import User
from luma.deps import CurrentUser, DbDep

router = APIRouter()

GLASS_ML = 250
BUDDIES = {"frog", "cat", "dog", "axolotl"}
MAX_LOG_ML = 2000
MIN_GOAL_ML = 250
MAX_GOAL_ML = 10000
MIN_GLASS_ML = 50
MAX_GLASS_ML = 1000


class WaterLogIn(BaseModel):
    amount_ml: int | None = None


class WaterSettingsIn(BaseModel):
    buddy: str | None = None
    goal_ml: int | None = None
    glass_ml: int | None = None
    water_presets: list[int] | None = None


def _day_bounds(tz: str | None) -> tuple[datetime, datetime]:
    # SERVER_TIMEZONE is authoritative; the client tz hint is ignored so the
    # water day rolls over on the server clock, not the device clock.
    resolved = ZoneInfo(settings.server_timezone)
    today = datetime.now(resolved).date()
    start = datetime.combine(today, time.min, tzinfo=resolved).astimezone(UTC)
    end = datetime.combine(today + timedelta(days=1), time.min, tzinfo=resolved).astimezone(UTC)
    return start, end


async def _summary(db: AsyncSession, user: User, start: datetime, end: datetime) -> dict[str, Any]:
    row = (
        await db.execute(
            text("""
                SELECT COALESCE(SUM(amount_ml), 0) AS total_ml, COUNT(*) AS entries
                FROM water_logs
                WHERE user_id = :uid AND ts >= :start AND ts < :end
            """),
            {"uid": str(user.id), "start": start, "end": end},
        )
    ).one()
    total = int(row.total_ml or 0)
    goal = int(user.water_goal_ml or 2000)
    glass = int(user.water_glass_ml or GLASS_ML)
    buddy = user.water_buddy if user.water_buddy in BUDDIES else "frog"
    presets = user.water_presets if user.water_presets else [250, 500, 750]
    return {
        "total_ml": total,
        "entries": int(row.entries or 0),
        "goal_ml": goal,
        "glass_ml": glass,
        "goal_met": total >= goal,
        "buddy": buddy,
        "presets": presets,
    }


@router.get("/today")
async def water_today(
    user: CurrentUser, db: DbDep, tz: str | None = Query(default=None)
) -> dict[str, Any]:
    start, end = _day_bounds(tz)
    return await _summary(db, user, start, end)


@router.post("/log", status_code=201)
async def log_water(
    body: WaterLogIn, user: CurrentUser, db: DbDep, tz: str | None = Query(default=None)
) -> dict[str, Any]:
    amount = body.amount_ml if body.amount_ml is not None else int(user.water_glass_ml or GLASS_ML)
    if not 0 < amount <= MAX_LOG_ML:
        raise HTTPException(status_code=422, detail=f"amount_ml must be between 1 and {MAX_LOG_ML}")
    await db.execute(
        text("INSERT INTO water_logs (id, user_id, amount_ml) VALUES (:id, :uid, :amount)"),
        {"id": str(uuid.uuid4()), "uid": str(user.id), "amount": amount},
    )
    await db.commit()
    start, end = _day_bounds(tz)
    return await _summary(db, user, start, end)


@router.delete("/last")
async def undo_last(
    user: CurrentUser, db: DbDep, tz: str | None = Query(default=None)
) -> dict[str, Any]:
    start, end = _day_bounds(tz)
    await db.execute(
        text("""
            DELETE FROM water_logs
            WHERE id = (
                SELECT id FROM water_logs
                WHERE user_id = :uid AND ts >= :start AND ts < :end
                ORDER BY ts DESC
                LIMIT 1
            )
        """),
        {"uid": str(user.id), "start": start, "end": end},
    )
    await db.commit()
    return await _summary(db, user, start, end)


@router.get("/settings")
async def get_settings(user: CurrentUser) -> dict[str, Any]:
    buddy = user.water_buddy if user.water_buddy in BUDDIES else "frog"
    return {
        "buddy": buddy,
        "goal_ml": int(user.water_goal_ml or 2000),
        "glass_ml": int(user.water_glass_ml or GLASS_ML),
        "water_presets": user.water_presets if user.water_presets else [250, 500, 750],
    }


@router.put("/settings")
async def update_settings(body: WaterSettingsIn, user: CurrentUser, db: DbDep) -> dict[str, Any]:
    if body.buddy is not None and body.buddy not in BUDDIES:
        raise HTTPException(status_code=422, detail=f"buddy must be one of {sorted(BUDDIES)}")
    if body.goal_ml is not None and not MIN_GOAL_ML <= body.goal_ml <= MAX_GOAL_ML:
        raise HTTPException(
            status_code=422, detail=f"goal_ml must be between {MIN_GOAL_ML} and {MAX_GOAL_ML}"
        )
    if body.glass_ml is not None and not MIN_GLASS_ML <= body.glass_ml <= MAX_GLASS_ML:
        raise HTTPException(
            status_code=422, detail=f"glass_ml must be between {MIN_GLASS_ML} and {MAX_GLASS_ML}"
        )
    if body.water_presets is not None:
        if len(body.water_presets) != 3:
            raise HTTPException(status_code=422, detail="water_presets must contain exactly 3 elements")
        for val in body.water_presets:
            if not 50 <= val <= 2000:
                raise HTTPException(status_code=422, detail="Each preset must be between 50 and 2000 ml")

    buddy = body.buddy if body.buddy is not None else user.water_buddy
    goal = body.goal_ml if body.goal_ml is not None else int(user.water_goal_ml)
    glass = body.glass_ml if body.glass_ml is not None else int(user.water_glass_ml)
    presets = body.water_presets if body.water_presets is not None else user.water_presets

    await db.execute(
        text(
            "UPDATE users SET water_buddy = :buddy, water_goal_ml = :goal,"
            " water_glass_ml = :glass, water_presets = :presets WHERE id = :uid"
        ),
        {"buddy": buddy, "goal": goal, "glass": glass, "presets": presets, "uid": str(user.id)},
    )
    await db.commit()
    return {"buddy": buddy, "goal_ml": goal, "glass_ml": glass, "water_presets": presets}
