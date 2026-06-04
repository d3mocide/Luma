import hashlib
import hmac
import logging
from uuid import UUID

from fastapi import APIRouter, HTTPException, Request, status

from luma.config import settings
from luma.deps import CurrentUser, DbDep
from luma.services.hae_metrics import tracker as hae_metrics_tracker
from luma.services.hae_normalizer import normalize_hae_payload

logger = logging.getLogger(__name__)
router = APIRouter()

_redis = None


def _get_redis():
    global _redis
    if _redis is None:
        from redis.asyncio import Redis
        _redis = Redis.from_url(settings.redis_url, decode_responses=True)
    return _redis


def _verify_app_secret(request: Request) -> None:
    """Validate X-HAE-Signature header against the app-level shared secret.

    Skipped when hae_shared_secret is not configured (dev / legacy setups).
    Uses constant-time comparison to prevent timing attacks.
    """
    if not settings.hae_shared_secret:
        return
    header_value = request.headers.get("X-HAE-Signature", "")
    if not hmac.compare_digest(header_value, settings.hae_shared_secret):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid app secret")


async def _check_replay(replay_key: str) -> None:
    """Reject replayed requests by storing seen keys in Redis for 10 minutes.

    Fails open if Redis is unavailable — health data ingestion is not blocked.
    """
    key = f"hae:replay:{replay_key}"
    try:
        redis = _get_redis()
        stored = await redis.set(key, "1", nx=True, ex=600)
        if stored is None:
            # nx=True returns None when the key already existed
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Duplicate request")
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("Redis replay check unavailable, proceeding: %s", exc)


@router.post("/hae")
async def ingest_hae_authenticated(
    request: Request,
    user: CurrentUser,
    db: DbDep,
) -> dict:
    """Accept HAE data from an authenticated session (no per-user import token required)."""
    _verify_app_secret(request)
    body = await request.body()
    replay_key = f"{user.id}:{hashlib.sha256(body).hexdigest()}"
    await _check_replay(replay_key)

    import orjson
    try:
        payload = orjson.loads(body)
    except Exception:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid JSON")

    try:
        rows_inserted = await normalize_hae_payload(payload, db, user.id)
    except Exception as exc:
        await hae_metrics_tracker.record_ingest(rows_inserted=0, error=str(exc))
        raise

    await hae_metrics_tracker.record_ingest(rows_inserted=rows_inserted)
    return {"status": "ok", "rows_inserted": rows_inserted}


@router.post("/hae/{import_token}")
async def ingest_hae(
    import_token: UUID,
    request: Request,
    db: DbDep,
) -> dict:
    _verify_app_secret(request)
    body = await request.body()

    from luma.db.models import User
    from sqlalchemy import select

    result = await db.execute(select(User).where(User.hae_import_token == import_token))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid import token")
    replay_key = f"{import_token}:{hashlib.sha256(body).hexdigest()}"
    await _check_replay(replay_key)

    import orjson
    try:
        payload = orjson.loads(body)
    except Exception:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid JSON")

    try:
        rows_inserted = await normalize_hae_payload(payload, db, user.id)
    except Exception as exc:
        await hae_metrics_tracker.record_ingest(rows_inserted=0, error=str(exc))
        raise

    await hae_metrics_tracker.record_ingest(rows_inserted=rows_inserted)
    return {"status": "ok", "rows_inserted": rows_inserted}
