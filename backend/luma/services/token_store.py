"""Single-use tracking for refresh token IDs (jti) backed by Redis.

A refresh token may be redeemed exactly once; redeeming it again (replay of
a stolen token, or a token invalidated by logout) is rejected. Entries
expire alongside the token itself so the set stays bounded.

Fails open if Redis is unavailable — losing rotation enforcement is
preferable to locking every user out, and the token-version check in the
JWT payload still applies.
"""
import logging

from luma.config import settings

logger = logging.getLogger(__name__)

_redis = None
_PREFIX = "auth:refresh-used:"


def _get_redis():
    global _redis
    if _redis is None:
        from redis.asyncio import Redis
        _redis = Redis.from_url(settings.redis_url, decode_responses=True)
    return _redis


async def consume_refresh_jti(jti: str, ttl_seconds: int) -> bool:
    """Mark a refresh token id as used. Returns False if it was already used."""
    try:
        redis = _get_redis()
        stored = await redis.set(f"{_PREFIX}{jti}", "1", nx=True, ex=max(ttl_seconds, 1))
        return stored is not None
    except Exception as exc:
        logger.warning("Redis unavailable for refresh-token tracking, allowing: %s", exc)
        return True


async def revoke_refresh_jti(jti: str, ttl_seconds: int) -> None:
    """Invalidate a refresh token id (logout) regardless of prior use."""
    try:
        redis = _get_redis()
        await redis.set(f"{_PREFIX}{jti}", "1", ex=max(ttl_seconds, 1))
    except Exception as exc:
        logger.warning("Redis unavailable for refresh-token revocation: %s", exc)
