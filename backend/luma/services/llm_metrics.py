from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any

from redis.asyncio import Redis
from redis.exceptions import RedisError

from luma.config import settings

logger = logging.getLogger(__name__)

METRICS_HASH_KEY = "luma:llm_metrics:totals"
METRICS_EVENTS_KEY = "luma:llm_metrics:recent_events"
METRICS_META_KEY = "luma:llm_metrics:meta"
METRICS_EVENT_LIMIT = 20


class LLMMetricsTracker:
    def __init__(self) -> None:
        self._redis: Redis[str] | None = None

    def _client(self) -> Redis[str]:
        if self._redis is None:
            self._redis = Redis.from_url(settings.redis_url, decode_responses=True)
        return self._redis

    async def record_event(
        self,
        *,
        event: str,
        model: str,
        provider: str,
        attempt: str,
        elapsed_ms: float | None = None,
        prompt_tokens: int | None = None,
        completion_tokens: int | None = None,
        total_tokens: int | None = None,
        error_type: str | None = None,
        fallback_model: str | None = None,
        trigger: str | None = None,
    ) -> None:
        timestamp = datetime.now(timezone.utc).isoformat()
        payload: dict[str, Any] = {
            "ts": timestamp,
            "event": event,
            "model": model,
            "provider": provider,
            "attempt": attempt,
        }
        if elapsed_ms is not None:
            payload["elapsed_ms"] = elapsed_ms
        if prompt_tokens is not None:
            payload["prompt_tokens"] = prompt_tokens
        if completion_tokens is not None:
            payload["completion_tokens"] = completion_tokens
        if total_tokens is not None:
            payload["total_tokens"] = total_tokens
        if error_type is not None:
            payload["error_type"] = error_type
        if fallback_model is not None:
            payload["fallback_model"] = fallback_model
        if trigger is not None:
            payload["trigger"] = trigger

        try:
            redis = self._client()
            pipe = redis.pipeline()
            if event == "success":
                pipe.hincrby(METRICS_HASH_KEY, "attempts", 1)
                pipe.hincrby(METRICS_HASH_KEY, "successes", 1)
                pipe.hset(METRICS_META_KEY, mapping={"last_success_at": timestamp})
            elif event == "failure":
                pipe.hincrby(METRICS_HASH_KEY, "attempts", 1)
                pipe.hincrby(METRICS_HASH_KEY, "failures", 1)
                pipe.hset(METRICS_META_KEY, mapping={"last_failure_at": timestamp})
            elif event == "fallback_retry":
                pipe.hincrby(METRICS_HASH_KEY, "fallback_retries", 1)

            pipe.lpush(METRICS_EVENTS_KEY, json.dumps(payload, separators=(",", ":")))
            pipe.ltrim(METRICS_EVENTS_KEY, 0, METRICS_EVENT_LIMIT - 1)
            await pipe.execute()
        except RedisError:
            logger.exception("Failed to record LLM metrics in Redis")

    async def snapshot(self) -> dict[str, Any]:
        try:
            redis = self._client()
            totals = await redis.hgetall(METRICS_HASH_KEY)
            meta = await redis.hgetall(METRICS_META_KEY)
            raw_events = await redis.lrange(METRICS_EVENTS_KEY, 0, METRICS_EVENT_LIMIT - 1)
        except RedisError:
            logger.exception("Failed to load LLM metrics from Redis")
            return self._empty_snapshot(source="redis-unavailable")

        return {
            "scope": "redis",
            "resets_on_restart": False,
            "source": "redis",
            "totals": {
                "attempts": int(totals.get("attempts") or 0),
                "successes": int(totals.get("successes") or 0),
                "failures": int(totals.get("failures") or 0),
                "fallback_retries": int(totals.get("fallback_retries") or 0),
            },
            "last_success_at": meta.get("last_success_at"),
            "last_failure_at": meta.get("last_failure_at"),
            "recent_events": [json.loads(item) for item in raw_events],
        }

    def _empty_snapshot(self, *, source: str) -> dict[str, Any]:
        return {
            "scope": source,
            "resets_on_restart": True,
            "source": source,
            "totals": {
                "attempts": 0,
                "successes": 0,
                "failures": 0,
                "fallback_retries": 0,
            },
            "last_success_at": None,
            "last_failure_at": None,
            "recent_events": [],
        }


tracker = LLMMetricsTracker()