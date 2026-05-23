import hashlib
import hmac
import logging
from typing import Any

from fastapi import APIRouter, Header, HTTPException, Request, status
from pydantic import BaseModel

from sovereign_health.config import settings
from sovereign_health.deps import DbDep
from sovereign_health.services.hae_normalizer import normalize_hae_payload

logger = logging.getLogger(__name__)
router = APIRouter()


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


@router.post("/hae")
async def ingest_hae(
    request: Request,
    db: DbDep,
    x_hae_signature: str | None = Header(None),
) -> dict:
    body = await request.body()
    _verify_hae_signature(body, x_hae_signature)

    import orjson
    try:
        payload = orjson.loads(body)
    except Exception:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid JSON")

    rows_inserted = await normalize_hae_payload(payload, db)
    return {"status": "ok", "rows_inserted": rows_inserted}
