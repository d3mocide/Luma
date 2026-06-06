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

# Reasoning tags emitted by local models before the answer; gemma uses <think>,
# other builds use <thinking>/<reasoning>. Matched case-insensitively.
_REASONING_TAG = r"(?:think(?:ing)?|reason(?:ing)?)"


class InsightResponse(BaseModel):
    headline: str = Field(description="Headline summarizing the insight (8 words or less)")
    body: str = Field(description="Warm, clinically grounded, actionable description (1-2 sentences)")
    thread_seed: str = Field(description="Follow-up question the user might ask the coach (12 words or less)")


def _parse_insight(content: str) -> dict | None:
    """Extract and validate the narrator's JSON payload, or return None.

    Reasoning models (the local narrator runs with reasoning enabled) prefill a
    <think> block before the JSON answer, so json.loads() on the raw content
    fails and the old code silently fell back to the "New insight" default. Strip
    any reasoning wrapper, recover the JSON object, and validate against
    InsightResponse rather than trusting dict.get() defaults.
    """
    content = content.strip()
    # Drop reasoning blocks (closed or dangling) so they don't shadow the answer.
    _flags = re.DOTALL | re.IGNORECASE
    content = re.sub(rf"<{_REASONING_TAG}>.*?</{_REASONING_TAG}>", "", content, flags=_flags)
    content = re.sub(rf"^.*</{_REASONING_TAG}>", "", content, flags=_flags)
    content = content.strip()
    content = re.sub(r"^```(?:json)?\n?", "", content)
    content = re.sub(r"\n?```$", "", content).strip()

    candidates = [content]
    # Prefer the last balanced object — the answer follows any reasoning text.
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
    "motivational_nudge": (
        "no health warnings are active today — surface what is genuinely going well "
        "in the user's nutrition, streak, and weight data, and provide warm, specific encouragement. "
        "If any metric is below target, acknowledge it briefly and frame it as an opportunity, not a failure."
    ),
    "weight_stall": (
        "weight has plateaued over the past 14 days despite remaining more than 2 kg from goal — "
        "the current eating and activity pattern is not producing the expected trend"
    ),
    "ldl_proxy_stall": (
        "saturated fat has been above target and soluble fiber has been below target for 14 consecutive days — "
        "a persistent pattern that is unfavorable for LDL cholesterol management"
    ),
    "weight_trend_worsening": (
        "the recent 14-day weight trend has reversed or significantly worsened compared to the prior 28-day trend — "
        "progress that was being made has stalled or reversed, and a course correction may be needed"
    ),
    "biometric_cluster_anomaly": (
        "multiple biometric signals (HRV, resting heart rate, sleep score) have been simultaneously abnormal "
        "for several recent days, forming a statistical outlier cluster — this may indicate compounding stress or illness"
    ),
    "weekly_recap": (
        "it is the end of the week — provide a warm, personalised summary of the user's LDL-relevant wins "
        "(days on target for sat fat and fiber, heart-healthy foods eaten, weight direction) and misses "
        "(days over sat fat, under fiber, missed logging). Be specific about numbers and genuinely encouraging."
    ),
}


_STATIC_FALLBACKS = {
    "sat_fat_rolling": {
        "headline": "Saturated Fat Elevated",
        "body": "Your 7-day rolling average saturated fat intake is currently above your daily limit.",
        "thread_seed": "How can I reduce saturated fat in my daily meals?",
    },
    "low_fiber_rolling": {
        "headline": "Soluble Fiber Below Target",
        "body": "Your 7-day rolling average soluble fiber intake is lower than your daily target.",
        "thread_seed": "What are some easy ways to add more soluble fiber?",
    },
    "weight_trend_diverging": {
        "headline": "Weight Trajectory Diverging",
        "body": "Your recent weight measurements are moving away from your goal trajectory.",
        "thread_seed": "How can I adjust my calorie intake to get back on track?",
    },
    "hrv_drop": {
        "headline": "Heart Rate Variability Drop",
        "body": "Luma detected a noticeable drop in your HRV compared to your recent baseline.",
        "thread_seed": "What factors could be causing my HRV to drop?",
    },
    "logging_streak_broken": {
        "headline": "Logging Streak Interrupted",
        "body": "Your consistent daily meal logging streak was interrupted. Let's resume today!",
        "thread_seed": "Can we look at my logging patterns to help me stay consistent?",
    },
    "aggressive_deficit": {
        "headline": "Calorie Deficit Too Aggressive",
        "body": "Your average daily deficit is exceeding 500 kcal, which may impact muscle retention.",
        "thread_seed": "Is a smaller calorie deficit safer for my goals?",
    },
    "ldl_risk_day": {
        "headline": "LDL Cholesterol Risk Pattern",
        "body": "Yesterday's food log showed elevated saturated fat and low soluble fiber.",
        "thread_seed": "How can I plan tomorrow's meals to balance fat and fiber?",
    },
    "positive_milestone": {
        "headline": "Consistency Milestone Reached!",
        "body": "Congratulations on staying consistent with your health goals this week!",
        "thread_seed": "What is the best way to maintain this positive momentum?",
    },
    "sodium_potassium_ratio": {
        "headline": "Na:K Ratio Above Target",
        "body": "Your rolling 7-day sodium-to-potassium ratio is unfavorable for cardiovascular health.",
        "thread_seed": "What foods are high in potassium and low in sodium?",
    },
    "motivational_nudge": {
        "headline": "Keep Up the Great Work!",
        "body": "Your health metrics are looking stable. Keep focusing on your daily habits.",
        "thread_seed": "How are my overall trends looking this week?",
    },
    "weight_stall": {
        "headline": "Weight Trend Plateau",
        "body": "Your weight has stalled over the past 14 days despite being away from your target.",
        "thread_seed": "Should I adjust my calorie target or activity levels?",
    },
    "ldl_proxy_stall": {
        "headline": "Persistent LDL Risk Pattern",
        "body": "Saturated fat has remained high and fiber low for two consecutive weeks.",
        "thread_seed": "What are some heart-healthy meal swaps I can make?",
    },
    "weight_trend_worsening": {
        "headline": "Weight Trajectory Stall",
        "body": "Your recent 14-day weight trend has stalled or worsened compared to the prior 28 days.",
        "thread_seed": "How can I break through this weight stall?",
    },
    "biometric_cluster_anomaly": {
        "headline": "Biometric Anomaly Detected",
        "body": "Multiple biometric signals have been simultaneously abnormal over the last few days.",
        "thread_seed": "What should I focus on when my biometrics show stress?",
    },
    "weekly_recap": {
        "headline": "Your Weekly Health Recap",
        "body": "Here is a summary of your LDL-relevant wins and focus areas from the past week.",
        "thread_seed": "What should I focus on changing for the coming week?",
    },
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

    try:
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
        # bad output back and ask for a clean object before falling back to a static copy.
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
    except Exception as exc:
        logger.warning(
            "Narrator LLM call failed for alert %s (rule: %s): %s. Using static fallback.",
            alert_id, rule_id, str(exc)
        )
        return _STATIC_FALLBACKS.get(rule_id, {
            "headline": "Health Insight",
            "body": f"Luma updated your analysis for rule {rule_id}.",
            "thread_seed": "What does this insight mean for me?",
        })

    logger.error("Narrator could not produce a valid insight for alert %s. Using static fallback.", alert_id)
    return _STATIC_FALLBACKS.get(rule_id, {
        "headline": "Health Insight",
        "body": f"Luma updated your analysis for rule {rule_id}.",
        "thread_seed": "What does this insight mean for me?",
    })

