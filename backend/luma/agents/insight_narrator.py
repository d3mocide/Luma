"""Insight narrator agent — converts alert payloads to human-readable insights."""
from __future__ import annotations

import json
import logging
import re
from pydantic import BaseModel, Field

from luma.config import settings
from luma.services.llm_client import call_llm
from luma.agents.prompt_loader import load_prompt

logger = logging.getLogger(__name__)


class InsightResponse(BaseModel):
    headline: str = Field(description="Headline summarizing the insight (8 words or less)")
    body: str = Field(description="Warm, clinically grounded, actionable description (1-2 sentences)")
    thread_seed: str = Field(description="Follow-up question the user might ask the coach (12 words or less)")


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

    resp = await call_llm(
        primary_model=settings.insight_narrator_model,
        fallback_model=settings.insight_narrator_fallback_model,
        trigger="insight_narrate",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.4,
        timeout=30.0,
        response_format=InsightResponse,
    )

    content = resp["choices"][0]["message"]["content"].strip()
    content = re.sub(r"^```(?:json)?\n?", "", content)
    content = re.sub(r"\n?```$", "", content).strip()

    try:
        parsed = json.loads(content)
        return {
            "headline": parsed.get("headline", "New insight"),
            "body": parsed.get("body", ""),
            "thread_seed": parsed.get("thread_seed", ""),
        }
    except json.JSONDecodeError:
        logger.error("Narrator returned invalid JSON for alert %s: %s", alert_id, content)
        return {"headline": "New insight", "body": content[:200], "thread_seed": ""}
