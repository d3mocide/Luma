import hashlib
import hmac
import logging
from typing import Any

from fastapi import APIRouter, Header, HTTPException, Request, status
from pydantic import BaseModel

from luma.config import settings
from luma.deps import DbDep
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


class HAEPayload(BaseModel):
    data: dict[str, Any]


def _verify_hae_signature(body: bytes, signature: str | None) -> None:
    if not signature:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing signature")
    expected = hmac.new(
        settings.hae_shared_secret.encode(),
        body,
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(expected, signature.lower()):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid signature")


async def _check_replay(signature: str) -> None:
    """Reject replayed requests by storing seen signatures in Redis for 10 minutes.

    Fails open if Redis is unavailable — health data ingestion is not blocked.
    """
    key = f"hae:replay:{signature}"
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
async def ingest_hae(
    request: Request,
    db: DbDep,
    x_hae_signature: str | None = Header(None),
) -> dict:
    body = await request.body()
    _verify_hae_signature(body, x_hae_signature)
    await _check_replay(x_hae_signature)  # type: ignore[arg-type]  # signature verified non-None above

    import orjson
    try:
        payload = orjson.loads(body)
    except Exception:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid JSON")

    try:
        rows_inserted = await normalize_hae_payload(payload, db)
    except Exception as exc:
        await hae_metrics_tracker.record_ingest(rows_inserted=0, error=str(exc))
        raise

    await hae_metrics_tracker.record_ingest(rows_inserted=rows_inserted)
    return {"status": "ok", "rows_inserted": rows_inserted}
