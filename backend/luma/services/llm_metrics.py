from __future__ import annotations

import json
import logging
from datetime import UTC, datetime
from typing import Any

from redis.asyncio import Redis
from redis.exceptions import RedisError

from luma.config import settings

logger = logging.getLogger(__name__)

# Lazy async engine used only for per-user llm_events writes (pool_size=2).
# Kept separate from the main request engine so callers don't need to thread db.
_db_engine: Any = None


def _get_db_engine() -> Any:
    global _db_engine
    if _db_engine is None:
        from sqlalchemy.ext.asyncio import create_async_engine
        _db_engine = create_async_engine(
            settings.database_url,
            pool_size=2,
            max_overflow=0,
            pool_pre_ping=True,
        )
    return _db_engine

METRICS_HASH_KEY = "luma:llm_metrics:totals"
METRICS_EVENTS_KEY = "luma:llm_metrics:recent_events"
METRICS_META_KEY = "luma:llm_metrics:meta"
METRICS_EVENT_LIMIT = 20


class LLMMetricsTracker:
    def __init__(self) -> None:
        self._redis: Redis[str] | None = None  # type: ignore[type-arg]

    def _client(self) -> Redis[str]:  # type: ignore[type-arg]
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
        user_id: str | None = None,
        elapsed_ms: float | None = None,
        prompt_tokens: int | None = None,
        completion_tokens: int | None = None,
        total_tokens: int | None = None,
        error_type: str | None = None,
        fallback_model: str | None = None,
        trigger: str | None = None,
    ) -> None:
        timestamp = datetime.now(UTC).isoformat()
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
                
                # Record global and model-specific token counts
                if prompt_tokens is not None and prompt_tokens > 0:
                    pipe.hincrby(METRICS_HASH_KEY, "prompt_tokens", prompt_tokens)
                    pipe.hincrby(METRICS_HASH_KEY, f"prompt_tokens:{model}", prompt_tokens)
                if completion_tokens is not None and completion_tokens > 0:
                    pipe.hincrby(METRICS_HASH_KEY, "completion_tokens", completion_tokens)
                    pipe.hincrby(METRICS_HASH_KEY, f"completion_tokens:{model}", completion_tokens)
                if total_tokens is not None and total_tokens > 0:
                    pipe.hincrby(METRICS_HASH_KEY, "total_tokens", total_tokens)
                    pipe.hincrby(METRICS_HASH_KEY, f"total_tokens:{model}", total_tokens)
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

        # Per-user Postgres write — only for success/failure, only when user_id provided
        if user_id and event in ("success", "failure"):
            await self._write_user_event(
                user_id=user_id,
                trigger=trigger or "",
                model=model,
                provider=provider,
                event=event,
                elapsed_ms=elapsed_ms,
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                total_tokens=total_tokens,
            )

    async def _write_user_event(
        self,
        *,
        user_id: str,
        trigger: str,
        model: str,
        provider: str,
        event: str,
        elapsed_ms: float | None,
        prompt_tokens: int | None,
        completion_tokens: int | None,
        total_tokens: int | None,
    ) -> None:
        try:
            from sqlalchemy import text
            engine = _get_db_engine()
            async with engine.begin() as conn:
                await conn.execute(
                    text("""
                        INSERT INTO llm_events
                            (user_id, trigger, model, provider, event,
                             elapsed_ms, prompt_tokens, completion_tokens, total_tokens)
                        VALUES
                            (:user_id, :trigger, :model, :provider, :event,
                             :elapsed_ms, :prompt_tokens, :completion_tokens, :total_tokens)
                    """),
                    {
                        "user_id": user_id,
                        "trigger": trigger,
                        "model": model,
                        "provider": provider,
                        "event": event,
                        "elapsed_ms": elapsed_ms,
                        "prompt_tokens": prompt_tokens,
                        "completion_tokens": completion_tokens,
                        "total_tokens": total_tokens,
                    },
                )
        except Exception:
            logger.exception("Failed to write llm_event for user %s", user_id)

    async def snapshot(self) -> dict[str, Any]:
        try:
            redis = self._client()
            totals = await redis.hgetall(METRICS_HASH_KEY)  # type: ignore[misc]
            meta = await redis.hgetall(METRICS_META_KEY)  # type: ignore[misc]
            raw_events = await redis.lrange(METRICS_EVENTS_KEY, 0, METRICS_EVENT_LIMIT - 1)  # type: ignore[misc]
        except RedisError:
            logger.exception("Failed to load LLM metrics from Redis")
            return self._empty_snapshot(source="redis-unavailable")

        model_totals = {}
        for k, v in totals.items():
            if k.startswith("prompt_tokens:") or k.startswith("completion_tokens:") or k.startswith("total_tokens:"):
                try:
                    model_totals[k] = int(v)
                except ValueError:
                    model_totals[k] = 0

        return {
            "scope": "redis",
            "resets_on_restart": False,
            "source": "redis",
            "totals": {
                "attempts": int(totals.get("attempts") or 0),
                "successes": int(totals.get("successes") or 0),
                "failures": int(totals.get("failures") or 0),
                "fallback_retries": int(totals.get("fallback_retries") or 0),
                "prompt_tokens": int(totals.get("prompt_tokens") or 0),
                "completion_tokens": int(totals.get("completion_tokens") or 0),
                "total_tokens": int(totals.get("total_tokens") or 0),
            },
            "model_totals": model_totals,
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
                "prompt_tokens": 0,
                "completion_tokens": 0,
                "total_tokens": 0,
            },
            "model_totals": {},
            "last_success_at": None,
            "last_failure_at": None,
            "recent_events": [],
        }


tracker = LLMMetricsTracker()