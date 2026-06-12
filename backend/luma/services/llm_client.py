from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime
from time import perf_counter
from typing import Any

import litellm

from luma.config import settings
from luma.services.llm_metrics import tracker as llm_metrics_tracker

logger = logging.getLogger(__name__)


def _local_openai_route(model: str) -> dict[str, Any]:
    """Route through an OpenAI-compatible local gateway (LocalAI/Ollama/etc.)."""
    return {
        "model": model,
        "custom_llm_provider": "openai",
        "api_base": settings.local_ai_api_base or None,
        "api_key": settings.local_ai_api_key or "not-needed",
    }


def _get_provider(model_alias: str, target: dict[str, Any]) -> str:
    """Infer the normalized provider identifier ('gemini', 'anthropic', 'local', etc.) from the model alias or target config."""
    if "/" in model_alias:
        return model_alias.split("/", 1)[0]
    if target.get("api_base") == settings.local_ai_api_base:
        return "local"
    return target.get("custom_llm_provider") or "native"


def build_litellm_target(model_name: str) -> dict[str, Any]:
    """Return LiteLLM kwargs for a model alias string.

    Supported prefixes:
      local/<id>     — OpenAI-compatible request to LOCAL_AI_API_BASE (Ollama etc.)
      gemini/<id>    — Google Gemini via GEMINI_API_KEY
      <provider>/<id> — provider-native cloud route (anthropic/, openai/, etc.)
      <bare-id>      — treated as local when LOCAL_AI_API_BASE is set
    """
    model_name = model_name.strip()

    if model_name.startswith("local/"):
        return _local_openai_route(model_name.split("/", 1)[1])

    if model_name.startswith("gemini/"):
        return {"model": model_name, "api_key": settings.gemini_api_key or None}

    if "/" in model_name:
        # Explicit provider prefix — let LiteLLM route natively.
        return {"model": model_name}

    # Bare model id: treat as local when a base URL is configured.
    if settings.local_ai_api_base:
        return _local_openai_route(model_name)

    return {"model": model_name}


def _usage_snapshot(response: Any) -> dict[str, Any]:
    usage = getattr(response, "usage", None)
    if usage is None and isinstance(response, dict):
        usage = response.get("usage")

    if usage is None:
        return {}

    if isinstance(usage, dict):
        return {
            "prompt_tokens": usage.get("prompt_tokens"),
            "completion_tokens": usage.get("completion_tokens"),
            "total_tokens": usage.get("total_tokens"),
        }

    return {
        "prompt_tokens": getattr(usage, "prompt_tokens", None),
        "completion_tokens": getattr(usage, "completion_tokens", None),
        "total_tokens": getattr(usage, "total_tokens", None),
    }


def _usage_fields(response: Any) -> dict[str, int | None]:
    usage = _usage_snapshot(response)
    return {
        "prompt_tokens": usage.get("prompt_tokens"),
        "completion_tokens": usage.get("completion_tokens"),
        "total_tokens": usage.get("total_tokens"),
    }


def _normalize_reasoning_response(response: Any) -> None:
    """If the LLM response has an empty/missing content field but has a reasoning
    field (e.g., from local reasoning models running via LocalAI/Ollama),
    copy the reasoning content to the content field so existing agents can parse it
    transparently.
    """
    try:
        choices: list[Any] = []
        if isinstance(response, dict):
            choices = response.get("choices") or []
        else:
            choices = getattr(response, "choices", []) or []

        for choice in choices:
            message = None
            if isinstance(choice, dict):
                message = choice.get("message")
            else:
                message = getattr(choice, "message", None)

            if message is None:
                continue

            content = None
            if isinstance(message, dict):
                content = message.get("content")
            else:
                content = getattr(message, "content", None)

            if not content:
                reasoning = None
                if isinstance(message, dict):
                    reasoning = message.get("reasoning") or message.get("reasoning_content")
                else:
                    reasoning = getattr(message, "reasoning", None) or getattr(message, "reasoning_content", None)

                if reasoning:
                    try:
                        # Try dictionary update
                        try:
                            message["content"] = reasoning
                        except Exception:
                            pass
                        # Try attribute update
                        try:
                            setattr(message, "content", reasoning)
                        except Exception:
                            pass
                    except Exception:
                        pass
    except Exception as exc:
        logger.warning("Failed to normalize reasoning response: %s", exc)


async def _call_target(target: dict[str, Any], *, model_alias: str, attempt: str, trigger: str | None = None, **kwargs: Any) -> Any:
    started = perf_counter()
    provider = _get_provider(model_alias, target)

    # Strip response_format for local targets to prevent UnsupportedParamsError in some LiteLLM environments,
    # as local endpoints (e.g., Ollama/LocalAI/vLLM) do not natively support Pydantic structured outputs,
    # and forcing JSON mode can interfere with reasoning model output (e.g., <think> tags).
    # drop_params=True is also added so LiteLLM silently discards any other unsupported params
    # (e.g. stream_options, null-valued fields) rather than raising UnsupportedParamsError.
    if provider == "local":
        kwargs = kwargs.copy()
        kwargs.pop("response_format", None)
        kwargs.setdefault("drop_params", True)

    try:
        timeout_s: float | None = kwargs.get("timeout")
        coro = litellm.acompletion(**target, **kwargs)
        # asyncio.wait_for enforces the timeout at the event-loop level so local
        # OpenAI-compatible endpoints (Ollama/LocalAI) cannot outlive the budget
        # even if LiteLLM's own timeout mechanism doesn't fire for them.
        if timeout_s is not None and provider == "local":
            response = await asyncio.wait_for(coro, timeout=timeout_s)
        else:
            response = await coro
        _normalize_reasoning_response(response)
        elapsed_ms = round((perf_counter() - started) * 1000, 1)
        usage = _usage_fields(response)
        provider = _get_provider(model_alias, target)
        await llm_metrics_tracker.record_event(
            event="success",
            model=model_alias,
            provider=provider,
            attempt=attempt,
            elapsed_ms=elapsed_ms,
            prompt_tokens=usage["prompt_tokens"],
            completion_tokens=usage["completion_tokens"],
            total_tokens=usage["total_tokens"],
            trigger=trigger,
        )
        logger.info(
            "LLM call succeeded",
            extra={
                "llm_event": "success",
                "llm_attempt": attempt,
                "llm_model": model_alias,
                "llm_provider": provider,
                "llm_elapsed_ms": elapsed_ms,
                "llm_trigger": trigger,
                **_usage_snapshot(response),
            },
        )
        return response
    except Exception as exc:
        elapsed_ms = round((perf_counter() - started) * 1000, 1)
        provider = _get_provider(model_alias, target)
        await llm_metrics_tracker.record_event(
            event="failure",
            model=model_alias,
            provider=provider,
            attempt=attempt,
            elapsed_ms=elapsed_ms,
            error_type=type(exc).__name__,
            trigger=trigger,
        )
        logger.exception(
            "LLM call failed",
            extra={
                "llm_event": "failure",
                "llm_attempt": attempt,
                "llm_model": model_alias,
                "llm_provider": provider,
                "llm_elapsed_ms": elapsed_ms,
                "llm_trigger": trigger,
            },
        )
        raise


def _inject_current_datetime(kwargs: dict[str, Any]) -> dict[str, Any]:
    """Prepend current UTC datetime to the system message so every model call is temporally grounded."""
    messages: list[dict[str, Any]] | None = kwargs.get("messages")
    if not messages:
        return kwargs

    now = datetime.now(UTC)
    date_line = f"Current date/time (UTC): {now.strftime('%A, %Y-%m-%d %H:%M')} UTC\n\n"

    kwargs = {**kwargs}
    messages = list(messages)

    for i, msg in enumerate(messages):
        if isinstance(msg, dict) and msg.get("role") == "system":
            messages[i] = {**msg, "content": date_line + (msg.get("content") or "")}
            kwargs["messages"] = messages
            return kwargs

    # No system message present — insert one at the front.
    messages.insert(0, {"role": "system", "content": date_line.rstrip()})
    kwargs["messages"] = messages
    return kwargs


async def call_llm(
    primary_model: str,
    fallback_model: str,
    *,
    trigger: str | None = None,
    **kwargs: Any,
) -> Any:
    """Call LiteLLM with automatic fallback.

    If primary_model fails for any reason and fallback_model is non-empty,
    LiteLLM retries transparently with the fallback target. This lets you pair
    a cheap/local primary with a reliable cloud fallback:

        await call_llm(
            primary_model=settings.food_extractor_model,       # local/gemma-4-e4b-it
            fallback_model=settings.food_extractor_fallback_model,  # gemini/gemini-2.5-flash
            messages=[...],
            temperature=0.1,
            trigger="food_extract",
        )
    """
    kwargs = _inject_current_datetime(kwargs)
    primary = build_litellm_target(primary_model)

    if fallback_model:
        fallback = build_litellm_target(fallback_model)
        logger.debug("LLM call configured with fallback", extra={"llm_model": primary_model, "llm_fallback_model": fallback_model})
        try:
            return await _call_target(primary, model_alias=primary_model, attempt="primary", trigger=trigger, **kwargs)
        except Exception:
            await llm_metrics_tracker.record_event(
                event="fallback_retry",
                model=primary_model,
                provider=_get_provider(primary_model, primary),
                attempt="primary",
                fallback_model=fallback_model,
                trigger=trigger,
            )
            logger.warning(
                "LLM primary failed; retrying with fallback",
                extra={"llm_event": "fallback_retry", "llm_model": primary_model, "llm_fallback_model": fallback_model},
            )
            await asyncio.sleep(1)
            return await _call_target(fallback, model_alias=fallback_model, attempt="fallback", trigger=trigger, **kwargs)

    logger.debug("LLM call configured without fallback", extra={"llm_model": primary_model})
    return await _call_target(primary, model_alias=primary_model, attempt="primary", trigger=trigger, **kwargs)
