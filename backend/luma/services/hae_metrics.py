from __future__ import annotations

import json
import logging
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from redis.asyncio import Redis
from redis.exceptions import RedisError

from luma.config import settings

logger = logging.getLogger(__name__)

HAE_METRICS_EVENT_LIMIT = 20


class HAEMetricsTracker:
    def __init__(self) -> None:
        self._redis: Redis[str] | None = None  # type: ignore[type-arg]

    def _client(self) -> Redis[str]:  # type: ignore[type-arg]
        if self._redis is None:
            self._redis = Redis.from_url(settings.redis_url, decode_responses=True)
        return self._redis

    def _keys(self, user_id: UUID | str) -> tuple[str, str, str]:
        uid = str(user_id)
        return (
            f"luma:hae_metrics:{uid}:totals",
            f"luma:hae_metrics:{uid}:events",
            f"luma:hae_metrics:{uid}:meta",
        )

    async def record_ingest(
        self,
        *,
        user_id: UUID | str,
        rows_inserted: int,
        error: str | None = None,
    ) -> None:
        timestamp = datetime.now(UTC).isoformat()
        event: dict[str, Any] = {"ts": timestamp, "rows_inserted": rows_inserted}
        if error is not None:
            event["error"] = error

        hash_key, events_key, meta_key = self._keys(user_id)
        try:
            redis = self._client()
            pipe = redis.pipeline()
            pipe.hincrby(hash_key, "attempts", 1)
            if error is None:
                pipe.hincrby(hash_key, "successes", 1)
                pipe.hincrby(hash_key, "rows_inserted", rows_inserted)
                pipe.hset(meta_key, mapping={"last_success_at": timestamp})
            else:
                pipe.hincrby(hash_key, "errors", 1)
                pipe.hset(meta_key, mapping={"last_error_at": timestamp})
            pipe.lpush(events_key, json.dumps(event, separators=(",", ":")))
            pipe.ltrim(events_key, 0, HAE_METRICS_EVENT_LIMIT - 1)
            await pipe.execute()
        except RedisError:
            logger.exception("Failed to record HAE metrics in Redis")

    async def snapshot(self, user_id: UUID | str) -> dict[str, Any]:
        hash_key, events_key, meta_key = self._keys(user_id)
        try:
            redis = self._client()
            totals = await redis.hgetall(hash_key)  # type: ignore[misc]
            meta = await redis.hgetall(meta_key)  # type: ignore[misc]
            raw_events = await redis.lrange(events_key, 0, HAE_METRICS_EVENT_LIMIT - 1)  # type: ignore[misc]
        except RedisError:
            logger.exception("Failed to load HAE metrics from Redis")
            return self._empty_snapshot()

        return {
            "totals": {
                "attempts": int(totals.get("attempts") or 0),
                "successes": int(totals.get("successes") or 0),
                "errors": int(totals.get("errors") or 0),
                "rows_inserted": int(totals.get("rows_inserted") or 0),
            },
            "last_success_at": meta.get("last_success_at"),
            "last_error_at": meta.get("last_error_at"),
            "recent_events": [json.loads(item) for item in raw_events],
        }

    def _empty_snapshot(self) -> dict[str, Any]:
        return {
            "totals": {"attempts": 0, "successes": 0, "errors": 0, "rows_inserted": 0},
            "last_success_at": None,
            "last_error_at": None,
            "recent_events": [],
        }


tracker = HAEMetricsTracker()
