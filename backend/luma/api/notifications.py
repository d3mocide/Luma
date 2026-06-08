import uuid
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import text

from luma.config import settings
from luma.deps import CurrentUser, DbDep

router = APIRouter()


class PushSubscribeRequest(BaseModel):
    endpoint: str
    p256dh: str
    auth: str
    device_label: str | None = None


class NotificationPrefsUpdate(BaseModel):
    nudge_enabled: bool
    nudge_hour: int
    nudge_tz: str


@router.get("/vapid-public-key")
async def get_vapid_public_key() -> dict:
    return {"public_key": settings.vapid_public_key}


@router.post("/subscribe")
async def subscribe(payload: PushSubscribeRequest, db: DbDep, current_user: CurrentUser) -> dict:
    await db.execute(
        text("""
            INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, device_label)
            VALUES (:id, :uid, :endpoint, :p256dh, :auth, :label)
            ON CONFLICT (endpoint) DO UPDATE SET p256dh = :p256dh, auth = :auth, device_label = :label
        """),
        {
            "id": str(uuid.uuid4()),
            "uid": str(current_user.id),
            "endpoint": payload.endpoint,
            "p256dh": payload.p256dh,
            "auth": payload.auth,
            "label": payload.device_label,
        },
    )
    await db.commit()
    return {"subscribed": True}


@router.post("/unsubscribe")
async def unsubscribe(payload: PushSubscribeRequest, db: DbDep, current_user: CurrentUser) -> dict:
    await db.execute(
        text("DELETE FROM push_subscriptions WHERE user_id = :uid AND endpoint = :ep"),
        {"uid": str(current_user.id), "ep": payload.endpoint},
    )
    await db.commit()
    return {"unsubscribed": True}


@router.get("/preferences")
async def get_preferences(current_user: CurrentUser) -> dict:
    return {
        "nudge_enabled": current_user.nudge_enabled,
        "nudge_hour": current_user.nudge_hour,
        "nudge_tz": current_user.nudge_tz,
    }


@router.put("/preferences")
async def update_preferences(
    payload: NotificationPrefsUpdate, db: DbDep, current_user: CurrentUser
) -> dict:
    if not 0 <= payload.nudge_hour <= 23:
        raise HTTPException(status_code=422, detail="nudge_hour must be 0–23")
    try:
        ZoneInfo(payload.nudge_tz)
    except (ZoneInfoNotFoundError, KeyError):
        raise HTTPException(status_code=422, detail=f"Unknown timezone: {payload.nudge_tz!r}")

    await db.execute(
        text("""
            UPDATE users
            SET nudge_enabled = :enabled, nudge_hour = :hour, nudge_tz = :tz
            WHERE id = :uid
        """),
        {
            "enabled": payload.nudge_enabled,
            "hour": payload.nudge_hour,
            "tz": payload.nudge_tz,
            "uid": str(current_user.id),
        },
    )
    await db.commit()
    return {
        "nudge_enabled": payload.nudge_enabled,
        "nudge_hour": payload.nudge_hour,
        "nudge_tz": payload.nudge_tz,
    }
