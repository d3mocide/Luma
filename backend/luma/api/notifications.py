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
    # All optional so a single field (e.g. the enable/disable toggle) can be
    # updated on its own. Re-sending the whole object meant a previously stored
    # timezone the server can't resolve would 422 the request and make it
    # impossible to even turn the nudge off.
    nudge_enabled: bool | None = None
    nudge_hour: int | None = None
    nudge_tz: str | None = None
    recap_enabled: bool | None = None
    health_alerts_enabled: bool | None = None


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
        "recap_enabled": current_user.recap_enabled,
        "health_alerts_enabled": current_user.health_alerts_enabled,
    }


@router.put("/preferences")
async def update_preferences(
    payload: NotificationPrefsUpdate, db: DbDep, current_user: CurrentUser
) -> dict:
    # Validate only the fields the caller is actually changing. A toggle that
    # leaves nudge_hour/nudge_tz untouched must succeed even if the stored value
    # is out of range or unresolvable — the worker already falls back to UTC.
    if payload.nudge_hour is not None and not 0 <= payload.nudge_hour <= 23:
        raise HTTPException(status_code=422, detail="nudge_hour must be 0–23")
    if payload.nudge_tz is not None:
        try:
            ZoneInfo(payload.nudge_tz)
        except (ZoneInfoNotFoundError, KeyError):
            raise HTTPException(status_code=422, detail=f"Unknown timezone: {payload.nudge_tz!r}")

    enabled = current_user.nudge_enabled if payload.nudge_enabled is None else payload.nudge_enabled
    hour = current_user.nudge_hour if payload.nudge_hour is None else payload.nudge_hour
    tz = current_user.nudge_tz if payload.nudge_tz is None else payload.nudge_tz
    recap = current_user.recap_enabled if payload.recap_enabled is None else payload.recap_enabled
    health_alerts = (
        current_user.health_alerts_enabled
        if payload.health_alerts_enabled is None
        else payload.health_alerts_enabled
    )

    await db.execute(
        text("""
            UPDATE users
            SET nudge_enabled = :enabled, nudge_hour = :hour, nudge_tz = :tz,
                recap_enabled = :recap, health_alerts_enabled = :health_alerts
            WHERE id = :uid
        """),
        {
            "enabled": enabled,
            "hour": hour,
            "tz": tz,
            "recap": recap,
            "health_alerts": health_alerts,
            "uid": str(current_user.id),
        },
    )
    await db.commit()
    return {
        "nudge_enabled": enabled,
        "nudge_hour": hour,
        "nudge_tz": tz,
        "recap_enabled": recap,
        "health_alerts_enabled": health_alerts,
    }
