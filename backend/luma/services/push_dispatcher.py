"""Web Push dispatcher — sends VAPID-signed push notifications to subscribed browsers."""
import asyncio
import json
import logging
from functools import partial

from luma.config import settings

logger = logging.getLogger(__name__)


def _send_webpush_sync(endpoint: str, p256dh: str, auth: str, payload: str) -> int | None:
    """Synchronous wrapper — runs in a thread executor. Returns HTTP status or None on success."""
    from pywebpush import WebPushException, webpush

    try:
        webpush(
            subscription_info={"endpoint": endpoint, "keys": {"p256dh": p256dh, "auth": auth}},
            data=payload,
            vapid_private_key=settings.vapid_private_key,
            vapid_claims={"sub": f"mailto:{settings.vapid_claims_email}"},
        )
        return None
    except WebPushException as exc:
        status = exc.response.status_code if exc.response is not None else None
        raise _PushError(str(exc), status)


class _PushError(Exception):
    def __init__(self, message: str, status_code: int | None):
        super().__init__(message)
        self.status_code = status_code


async def send_push_to_user(user_id: str, title: str, body: str, url: str = "/") -> None:
    """Send a push to every active subscription for a user. Expired subscriptions are pruned."""
    if not settings.vapid_private_key:
        logger.debug("VAPID not configured — skipping push for user %s", user_id)
        return

    from sqlalchemy import text

    from luma.db.session import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        rows = await db.execute(
            text("SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = :uid"),
            {"uid": user_id},
        )
        subscriptions = rows.fetchall()

    if not subscriptions:
        return

    payload = json.dumps({"title": title, "body": body, "url": url})
    loop = asyncio.get_running_loop()
    expired_endpoints: list[str] = []

    for sub in subscriptions:
        try:
            await loop.run_in_executor(
                None,
                partial(_send_webpush_sync, sub.endpoint, sub.p256dh, sub.auth, payload),
            )
        except _PushError as exc:
            if exc.status_code in (404, 410):
                expired_endpoints.append(sub.endpoint)
            else:
                logger.warning("Push failed for user %s endpoint …%s: %s", user_id, sub.endpoint[-20:], exc)

    if expired_endpoints:
        async with AsyncSessionLocal() as db:
            await db.execute(
                text("DELETE FROM push_subscriptions WHERE endpoint = ANY(:eps)"),
                {"eps": expired_endpoints},
            )
            await db.commit()
        logger.info("Pruned %d expired push subscriptions for user %s", len(expired_endpoints), user_id)
