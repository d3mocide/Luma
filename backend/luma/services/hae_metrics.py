from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any

from redis.asyncio import Redis
from redis.exceptions import RedisError

from luma.config import settings

logger = logging.getLogger(__name__)

HAE_METRICS_HASH_KEY = "luma:hae_metrics:totals"
HAE_METRICS_EVENTS_KEY = "luma:hae_metrics:recent_events"
HAE_METRICS_META_KEY = "luma:hae_metrics:meta"
HAE_METRICS_EVENT_LIMIT = 20


class HAEMetricsTracker:
    def __init__(self) -> None:
        self._redis: Redis[str] | None = None

    def _client(self) -> Redis[str]:
        if self._redis is None:
            self._redis = Redis.from_url(settings.redis_url, decode_responses=True)
        return self._redis

    async def record_ingest(
        self,
        *,
        rows_inserted: int,
        error: str | None = None,
    ) -> None:
        timestamp = datetime.now(timezone.utc).isoformat()
        event: dict[str, Any] = {"ts": timestamp, "rows_inserted": rows_inserted}
        if error is not None:
            event["error"] = error

        try:
            redis = self._client()
            pipe = redis.pipeline()
            pipe.hincrby(HAE_METRICS_HASH_KEY, "attempts", 1)
            if error is None:
                pipe.hincrby(HAE_METRICS_HASH_KEY, "successes", 1)
                pipe.hincrby(HAE_METRICS_HASH_KEY, "rows_inserted", rows_inserted)
                pipe.hset(HAE_METRICS_META_KEY, mapping={"last_success_at": timestamp})
            else:
                pipe.hincrby(HAE_METRICS_HASH_KEY, "errors", 1)
                pipe.hset(HAE_METRICS_META_KEY, mapping={"last_error_at": timestamp})
            pipe.lpush(HAE_METRICS_EVENTS_KEY, json.dumps(event, separators=(",", ":")))
            pipe.ltrim(HAE_METRICS_EVENTS_KEY, 0, HAE_METRICS_EVENT_LIMIT - 1)
            await pipe.execute()
        except RedisError:
            logger.exception("Failed to record HAE metrics in Redis")

    async def snapshot(self) -> dict[str, Any]:
        try:
            redis = self._client()
            totals = await redis.hgetall(HAE_METRICS_HASH_KEY)
            meta = await redis.hgetall(HAE_METRICS_META_KEY)
            raw_events = await redis.lrange(HAE_METRICS_EVENTS_KEY, 0, HAE_METRICS_EVENT_LIMIT - 1)
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
