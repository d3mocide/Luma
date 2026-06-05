"""Insight narrator agent — converts alert payloads to human-readable insights."""
from __future__ import annotations

import json
import logging
import re
from pydantic import BaseModel, Field, ValidationError

from luma.config import settings
from luma.services.llm_client import call_llm
from luma.agents.prompt_loader import load_prompt

logger = logging.getLogger(__name__)


class InsightResponse(BaseModel):
    headline: str = Field(description="Headline summarizing the insight (8 words or less)")
    body: str = Field(description="Warm, clinically grounded, actionable description (1-2 sentences)")
    thread_seed: str = Field(description="Follow-up question the user might ask the coach (12 words or less)")


def _parse_insight(content: str) -> dict | None:
    """Extract and validate the narrator's JSON payload, or return None.

    A local model handed a json_schema response_format sometimes echoes the
    schema (or wraps the object in prose) instead of returning a bare instance,
    so validate against InsightResponse rather than trusting dict.get() defaults —
    otherwise a malformed payload silently surfaces as the "New insight" default.
    """
    content = content.strip()
    content = re.sub(r"^```(?:json)?\n?", "", content)
    content = re.sub(r"\n?```$", "", content).strip()

    candidates = [content]
    embedded = re.search(r"\{.*\}", content, re.DOTALL)
    if embedded:
        candidates.append(embedded.group(0))

    for candidate in candidates:
        try:
            parsed = json.loads(candidate)
        except json.JSONDecodeError:
            continue
        if not isinstance(parsed, dict):
            continue
        try:
            return InsightResponse.model_validate(parsed).model_dump()
        except ValidationError:
            continue

    return None


_RULE_CONTEXT = {
    "sat_fat_rolling": "saturated fat intake has been elevated over the last 7 days",
    "low_fiber_rolling": "soluble fiber intake has been consistently below target for 7 days",
    "weight_trend_diverging": "weight trend is moving away from the goal",
    "hrv_drop": "HRV has dropped noticeably compared to recent baseline",
    "logging_streak_broken": "the meal logging streak was broken",
    "aggressive_deficit": "the average daily calorie deficit has been too aggressive",
    "ldl_risk_day": "yesterday was a high saturated fat and low fiber day, a pattern linked to LDL elevation",
    "positive_milestone": "a positive milestone was reached",
}


async def narrate_alert(
    alert_id: str,
    rule_id: str,
    severity: str,
    payload: dict,
) -> dict:
    context = _RULE_CONTEXT.get(rule_id, rule_id.replace("_", " "))
    user_prompt = (
        f"Alert context: {context}.\n"
        f"Severity: {severity}.\n"
        f"Data: {json.dumps(payload)}.\n"
        "Generate the insight JSON."
    )

    system_prompt = load_prompt("insight_narrator_system")
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]

    resp = await call_llm(
        primary_model=settings.insight_narrator_model,
        fallback_model=settings.insight_narrator_fallback_model,
        trigger="insight_narrate",
        messages=messages,
        temperature=0.4,
        timeout=30.0,
        response_format=InsightResponse,
    )

    content = resp["choices"][0]["message"]["content"]
    insight = _parse_insight(content)
    if insight is not None:
        return insight

    # The model returned something other than a valid insight object — send the
    # bad output back and ask for a clean object before falling back to a stub.
    logger.warning("Narrator returned no valid insight for alert %s; attempting correction retry", alert_id)
    correction_messages = messages + [
        {"role": "assistant", "content": content},
        {
            "role": "user",
            "content": (
                "That response did not contain the required keys. Respond with ONLY a "
                'minified JSON object with exactly these keys: "headline", "body", '
                '"thread_seed". No schema, no commentary, no other text.'
            ),
        },
    ]
    try:
        retry_resp = await call_llm(
            primary_model=settings.insight_narrator_model,
            fallback_model=settings.insight_narrator_fallback_model,
            trigger="insight_narrate",
            messages=correction_messages,
            temperature=0.4,
            timeout=60.0,
            response_format=InsightResponse,
        )
        insight = _parse_insight(retry_resp["choices"][0]["message"]["content"])
        if insight is not None:
            return insight
    except Exception:
        logger.exception("Narrator correction retry failed for alert %s", alert_id)

    logger.error("Narrator could not produce a valid insight for alert %s: %s", alert_id, content[:200])
    return {"headline": "New insight", "body": "", "thread_seed": ""}
