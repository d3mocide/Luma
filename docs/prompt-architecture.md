# Luma — Prompt Architecture Master Document
**Last updated:** 2026-05-30  
**Status:** Post-audit enhancements applied

---

## Architecture Overview

Luma has **7 distinct LLM call sites** across 5 files. No external proxy — LiteLLM is used as a Python library with direct provider routing encoded in model ID strings (`gemini/...`, `anthropic/...`, `local/...`). All calls go through `services/llm_client.py:call_llm()`, including the thread compressor (fixed in this audit cycle). The coach agent calls `litellm.acompletion()` directly only for streaming.

---

## 1. Food Extractor

**File:** `backend/luma/agents/food_extractor.py`  
**Triggered by:** `POST /log/meal/text` and `POST /log/meal/voice` (after Whisper transcription)

### Model
| Role | Model | Fallback |
|------|-------|---------|
| Primary | `gemini/gemini-2.5-flash` | `anthropic/claude-haiku-4-5` (recommended) |

### Call Parameters
| Param | Value |
|-------|-------|
| Temperature | `0.1` — near-deterministic extraction |
| Timeout | `180.0s` (retry: `60.0s`) |
| Streaming | No |

### System Prompt (verbatim)
```
You are Luma's high-fidelity clinical nutrition parser. Your task is to parse a
natural language description of food consumed and extract a valid JSON list of
items, calculating their nutrition based on standard USDA databases.
Ensure all fields are fully estimated for the specified portion size.

Output MUST be a valid JSON array without any introductory text or pleasantries.
You may wrap it in a standard ```json ... ``` block. Follow this JSON format
precisely:
[
  {
    "name": "steel cut oats",
    "quantity": 1.0,
    "unit": "cup",
    "estimated_weight_g": 234.0,
    "nutrients": {
      "calories": 150.0,
      "saturated_fat_g": 0.5,
      "soluble_fiber_g": 2.0,
      "protein_g": 5.0,
      "carbohydrates_g": 27.0,
      "fat_g": 2.5,
      "fiber_g": 4.0,
      "sodium_mg": 0.0
    }
  }
]
```

### User Prompt Template
```
Extract and parse this consumed meal log:
"{text}"
```

### System Memory
Stateless — no conversation history, no user context. Each call is independent.

### JSON Failure Recovery
On `json.JSONDecodeError`, makes one correction retry:
- Appends bad response as `assistant` turn
- Sends `"That response was not valid JSON. Return only the JSON array, no other text."` as `user` turn
- Retry uses `timeout=60.0s`
- If retry also fails: logs error with first 200 chars of bad content, returns `[]`

### Token Budget
| Part | Estimated Tokens |
|------|-----------------|
| System prompt (incl. schema) | ~450 |
| User prompt (avg meal description) | ~50–150 |
| Output (1–5 items) | ~200–800 |
| **Total per call (normal)** | **~700–1,400** |
| Correction retry (additional) | ~900–2,000 |

### Example Input → Output
**Input:** `"I had a bowl of steel cut oats with a tablespoon of ground flaxseed and half a cup of blueberries"`

**Output:**
```json
[
  {"name":"steel cut oats","quantity":1.0,"unit":"cup","estimated_weight_g":234.0,"nutrients":{"calories":150.0,"saturated_fat_g":0.5,"soluble_fiber_g":2.0,"protein_g":5.0,"carbohydrates_g":27.0,"fat_g":2.5,"fiber_g":4.0,"sodium_mg":0.0}},
  {"name":"ground flaxseed","quantity":1.0,"unit":"tablespoon","estimated_weight_g":10.0,"nutrients":{"calories":55.0,"saturated_fat_g":0.4,"soluble_fiber_g":0.7,"protein_g":1.9,"carbohydrates_g":3.0,"fat_g":4.3,"fiber_g":2.8,"sodium_mg":3.0}},
  {"name":"blueberries","quantity":0.5,"unit":"cup","estimated_weight_g":73.0,"nutrients":{"calories":42.0,"saturated_fat_g":0.0,"soluble_fiber_g":0.5,"protein_g":0.6,"carbohydrates_g":10.6,"fat_g":0.2,"fiber_g":1.7,"sodium_mg":1.0}}
]
```

---

## 2. Vision Classifier (Photo Logging)

**File:** `backend/luma/api/log.py` — `log_meal_photo()` (line 263)  
**Triggered by:** `POST /log/meal/photo`

### Model
| Role | Model | Fallback |
|------|-------|---------|
| Primary | `gemini/gemini-2.5-flash` | `anthropic/claude-haiku-4-5` (recommended) |

### Call Parameters
| Param | Value |
|-------|-------|
| Temperature | `0.1` |
| Timeout | `60.0s` (retry: `30.0s`) |
| Streaming | No |
| Modality | Multimodal (image + text) |

### System Prompt (verbatim)
```
You are Luma's food vision classifier. Identify food items in the image and
return structured nutrition data. Always respond with a valid JSON array only
— no markdown, no commentary.
```

### User Prompt Template (verbatim)
```
Identify all food items visible in this image.
Return a JSON array of food items with this schema:
[{"name":"...","quantity":1.0,"unit":"serving","estimated_weight_g":200.0,
"nutrients":{"calories":300,"saturated_fat_g":2.0,"soluble_fiber_g":1.0,
"protein_g":10.0,"carbohydrates_g":40.0,"fat_g":8.0,"fiber_g":3.0,"sodium_mg":400}}].
Fill in all nutrient values — do not leave them as 0. No markdown, no preamble.
```
Plus a base64-encoded image in `image_url` format.

### System Memory
Stateless — no conversation history or user context.

### JSON Failure Recovery
On `json.JSONDecodeError`, makes one correction retry:
- Appends bad response + correction user message to the existing messages list (image remains in context)
- Retry uses `timeout=30.0s`
- If retry also fails: logs error, returns `[]`

### Token Budget
| Part | Estimated Tokens |
|------|-----------------|
| System message | ~50 |
| Text prompt | ~120 |
| Image (varies by size/detail) | ~500–2,000 |
| Output (2–8 items typical) | ~300–1,200 |
| **Total per call (normal)** | **~970–3,370** |
| Correction retry (additional) | ~1,400–5,000 |

### Example Output
```json
[
  {"name":"scrambled eggs","quantity":2.0,"unit":"eggs","estimated_weight_g":100.0,"nutrients":{"calories":148,"saturated_fat_g":3.1,"soluble_fiber_g":0,"protein_g":10,"carbohydrates_g":1.6,"fat_g":10.6,"fiber_g":0,"sodium_mg":144}},
  {"name":"whole wheat toast","quantity":2.0,"unit":"slices","estimated_weight_g":60.0,"nutrients":{"calories":138,"saturated_fat_g":0.4,"soluble_fiber_g":0.5,"protein_g":5.6,"carbohydrates_g":26.8,"fat_g":1.8,"fiber_g":3.8,"sodium_mg":250}}
]
```

---

## 3. Meal Planner

**File:** `backend/luma/agents/meal_planner.py`  
**Triggered by:** `POST /plan/regenerate` → `generate_meal_plan()`

### Model
| Role | Model | Fallback |
|------|-------|---------|
| Primary | `anthropic/claude-sonnet-4-5` | `gemini/gemini-2.5-flash` (recommended) |

### Call Parameters
| Param | Value |
|-------|-------|
| Temperature | `0.2` |
| Timeout | `600.0s` (10 min) |
| Streaming | No |

### System Prompt (dynamic — interpolated at call time)
```
You are Luma's clinical nutrition orchestrator.
Your task is to generate a highly detailed 7-day heart-healthy meal plan and
shopping list tailored specifically to the user's cardiovascular, LDL
cholesterol-lowering, and fiber targets.

Core Objectives:
- Prioritize soluble fiber (aim for > {soluble_fiber_target}g daily) to bind
  and eliminate LDL cholesterol.
- Strictly cap saturated fat (limit to < {sat_fat_max}g daily).
- Meet calorie goal of approximately {calorie_target} kcal daily.
- Adhere to a {dietary_pattern} dietary pattern.

Input Constraints:
- Exclude these dislikes: {dislikes}
- Exclude these allergies: {allergies}
- Custom requests: {constraints}

Reference Local Foods list to match ingredients for the shopping list:
{available_foods_text}   ← up to 100 foods pre-filtered by allergens/dislikes

Output: You must return a strict, minified JSON object containing 'plan' and
'shopping_list'. Do not wrap in markdown or include any introductory text.
[...full JSON schema example...]
```

### User Prompt
```
Generate 7-day meal plan starting from week: {week_start}
```

### System Memory
Stateless but **data-rich** — user goals, dislikes, allergies, and a filtered local foods catalog are injected into the system prompt at generation time.

### Food Injection Filtering
Fetches 300 foods from DB, then excludes any where a dislike or allergen term appears in `food.name` or `food.tags` (case-insensitive substring match). Allergen exclusions run first (safety). Takes first 100 of remaining cleaned list.

### Token Budget
| Part | Estimated Tokens |
|------|-----------------|
| System base + schema example | ~700 |
| Up to 100 filtered foods at ~50 tokens/line | ~1,000–5,000 |
| User prompt | ~20 |
| Output (7-day plan + shopping list) | ~3,000–8,000 |
| **Total per call** | **~4,700–13,700** |

**Most expensive call in the system.** At Claude Sonnet pricing (~$3/$15 per M tokens in/out), a single plan generation costs roughly **$0.06–0.26** depending on catalog size after filtering.

### Example Output (one slot, abbreviated)
```json
{
  "plan": [
    {
      "date": "2026-05-26",
      "slots": [
        {
          "slot": "breakfast",
          "custom_name": "Steel Cut Oatmeal with Ground Flax & Blueberries",
          "notes": "Soluble fiber powerhouse designed to lower serum LDL.",
          "nutrients": {"calories":320.0,"saturated_fat_g":0.8,"soluble_fiber_g":6.0,"protein_g":12.0,"carbohydrates_g":48.0,"fat_g":6.0,"fiber_g":11.0,"sodium_mg":5.0}
        }
      ]
    }
  ],
  "shopping_list": [
    {"food_id": "uuid-or-null", "name": "Steel Cut Oats", "quantity": 280.0, "unit": "g", "aisle": "Grains"}
  ]
}
```

---

## 4. Coach Agent

**File:** `backend/luma/agents/coach.py`  
**Triggered by:** `GET /coach/threads/{id}/stream` (SSE)

### Model
| Role | Model | Fallback |
|------|-------|---------|
| Primary | `gemini/gemini-2.5-flash` | `anthropic/claude-haiku-4-5` (recommended) |

### Call Parameters
| Param | Value |
|-------|-------|
| Temperature | `0.5` |
| Timeout | `60.0s` |
| Streaming | Yes (SSE token-by-token) |
| Tool use | Yes — 7 tools, `tool_choice: "auto"` |
| Max iterations | 6 (tool loop guard) |

### System Prompt (static base + dynamic context)

**Base (always injected):**
```
You are Luma, a personal nutrition and health coach.
You have access to the user's biometric trends, meal history, and nutrition
data via tools. Use tools to ground your answers in real data before responding.
Be concise, warm, and clinically grounded. Never diagnose — always frame as
patterns and options. When you've gathered enough data, respond directly to
the user.
```

**Context block appended at call time** (rendered by `format_context_for_prompt()`):
```
## User snapshot (auto-updated every 2 hours)
**Goals:** 2000 kcal/day target, sat fat ≤13g, fiber ≥10g, goal weight 82 kg, heart-healthy
**Last 7d nutrition:** 1840 kcal avg, 11.2g sat fat avg, 7.3g fiber avg
**Latest biometrics:** weight 87.4 kg, HRV 42 ms, sleep score 74
**Weight trend (28d):** ↓ 0.21 kg/week
**Logging consistency:** 22/30 days logged
**Recent alerts:** [warning] Sat fat elevated this week

## Coaching history (rolling summary)
Goals
- Target weight 82 kg, LDL <100
- Prefers oat-based breakfasts, dislikes tofu
Patterns Identified
- Consistently low fiber on weekends
...
```

### Tools (7)
| Tool | Description | Args |
|------|-------------|------|
| `query_biometric_trend` | Daily HRV/weight/sleep data | metric, start_date, end_date |
| `query_nutrition_rollup` | Daily/weekly calorie/fat/fiber averages | period, start_date, end_date |
| `get_recent_meals` | Last N meals with items + nutrition | limit (1–20) |
| `propose_meal_swap` | Suggest LDL-optimized slot replacement | slot_id, goal_notes |
| `modify_plan` | Write a food change to a plan slot | slot_id, food_id, servings |
| `get_user_goals` | Fetch goal targets | none |
| `get_recent_alerts` | Last N Luma health alerts | limit (1–10) |

### System Memory
**Rich per-turn.** Three layers:
1. **Structured context snapshot** — goals, nutrition 7d avg, biometrics, weight trend, logging consistency, last 3 alerts. Refreshed every 2 hours by the worker, age-checked on every call.
2. **Rolling case file** — free-text clinical notes (max 350 words), organized under Goals / Patterns Identified / Conclusions & Plans / Open Questions. Updated every 2 hours or on new thread creation.
3. **Thread history** — full message array from DB. Compressed when it exceeds 30 messages (keeps last 10 uncompressed + a summary message prepended).

### Token Budget (per turn)
| Part | Estimated Tokens |
|------|-----------------|
| System base | ~80 |
| Context block | ~200–400 |
| Case file (≤350 words) | ~0–525 |
| Tool definitions (7 tools) | ~1,000 |
| Thread history (10–30 msgs) | ~2,000–6,000 |
| Output (streaming text) | ~200–600 |
| **Total per turn** | **~3,500–8,600** |

### Example SSE Stream
```
data: {"type":"tool_call","name":"query_nutrition_rollup"}
data: {"type":"tool_result","name":"query_nutrition_rollup"}
data: {"type":"token","text":"Your "}
data: {"type":"token","text":"fiber "}
data: {"type":"token","text":"average "}
...
data: {"type":"done"}
```

---

## 5. Insight Narrator

**File:** `backend/luma/agents/insight_narrator.py`  
**Triggered by:** Alert rule engine in worker when an alert fires

### Model
| Role | Model | Fallback |
|------|-------|---------|
| Primary | `gemini/gemini-2.5-flash` | `anthropic/claude-haiku-4-5` (recommended) |

### Call Parameters
| Param | Value |
|-------|-------|
| Temperature | `0.4` — warm, slightly varied tone |
| Timeout | `30.0s` |
| Streaming | No |

### System Prompt (verbatim)
```
You are Luma's insight narrator. You receive a health alert and produce a brief,
warm, clinically grounded insight for the user.
Respond with ONLY a minified JSON object with three keys:
"headline" (≤8 words), "body" (1-2 sentences, actionable),
"thread_seed" (a follow-up question the user might ask the coach, ≤12 words).
Never use jargon. Be encouraging, not alarming.
```

### Rule → Context Mapping
| `rule_id` | Injected context string |
|-----------|------------------------|
| `sat_fat_rolling` | "saturated fat intake has been elevated over the last 7 days" |
| `low_fiber_rolling` | "soluble fiber intake has been consistently below target for 7 days" |
| `weight_trend_diverging` | "weight trend is moving away from the goal" |
| `hrv_drop` | "HRV has dropped noticeably compared to recent baseline" |
| `logging_streak_broken` | "the meal logging streak was broken" |
| `aggressive_deficit` | "the average daily calorie deficit has been too aggressive" |
| `ldl_risk_day` | "yesterday was a high saturated fat and low fiber day, a pattern linked to LDL elevation" |
| `positive_milestone` | "a positive milestone was reached" |

### User Prompt Template
```
Alert context: {context}.
Severity: {severity}.
Data: {json.dumps(payload)}.
Generate the insight JSON.
```

### System Memory
Stateless — no user history or prior alerts injected.

### Token Budget
| Part | Estimated Tokens |
|------|-----------------|
| System | ~80 |
| User (context + severity + payload) | ~100–250 |
| Output (3-field JSON) | ~80–150 |
| **Total per call** | **~260–480** |

Cheapest call in the system. Gemini Flash cost: ~$0.0001–0.0002 per alert.

### Example Output
**Input:** `rule_id="sat_fat_rolling"`, `severity="warning"`, `payload={"avg_sat_fat_g": 17.2, "target_g": 13.0}`

```json
{
  "headline": "Saturated fat has been creeping up",
  "body": "Your average sat fat over the last 7 days is 17g — about 4g over your daily target. Swapping one red meat meal for fish or legumes this week could bring it back in range.",
  "thread_seed": "What are easy swaps to lower my saturated fat?"
}
```

---

## 6. Case File Updater

**File:** `backend/luma/services/coach_context.py` — `update_case_file()`  
**Triggered by:** Worker every 2 hours + on new thread creation (`update_case_file_task`)

### Model
| Role | Model | Fallback |
|------|-------|---------|
| Primary | `gemini/gemini-2.5-flash` (inherits `coach_model`) | `anthropic/claude-haiku-4-5` (recommended, inherits `coach_fallback_model`) |

### Call Parameters
| Param | Value |
|-------|-------|
| Temperature | `0.2` |
| Timeout | `45.0s` |
| Streaming | No |

### System Prompt (verbatim)
```
You are a health coach's clinical note-taker.
You will receive the coach's existing case notes and a transcript of recent
conversations. Produce updated case notes that incorporate new information.
Rules: max 350 words; use short bullet points grouped under these headings only:
Goals, Patterns Identified, Conclusions & Plans, Open Questions.
Drop outdated or superseded points. Never include dates — just facts and decisions.
Output plain text only, no markdown headers.
```

### User Prompt Template
```
## Existing case notes
{existing_notes}

## New conversation transcript
{transcript}   ← up to 200 messages, each truncated to 600 chars

Update the case notes.
```

### System Memory
**Accumulative** — the existing case file (from prior runs) is injected as context, creating a rolling document that persists in `coach_context.case_file`.

### Token Budget
| Part | Estimated Tokens |
|------|-----------------|
| System | ~100 |
| Existing notes (≤350 words) | ~0–525 |
| Transcript (up to 200 msgs × 600 chars) | ~2,000–20,000 |
| Output (≤350 words) | ~525 |
| **Total per call** | **~2,600–21,000** |

High variance — active users with large transcripts can generate expensive calls.

### Example Output
```
Goals
- Target LDL ≤100, current 142
- Lose 5 kg over 6 months; now 87.4 kg (goal 82 kg)
- ≥10g soluble fiber/day, ≤13g sat fat/day

Patterns Identified
- Fiber consistently low on weekends (typical 4–5g vs 9–10g weekdays)
- Prefers oat-based breakfasts; dislikes tofu
- Sat fat spikes when eating out at Italian restaurants

Conclusions & Plans
- Added psyllium husk to morning routine for fiber boost
- Agreed to review weekend meal plan specifically

Open Questions
- Whether to adjust calorie target after next LDL test
- Has been asking about intermittent fasting — needs guidance
```

---

## 7. Thread Compressor (Coach)

**File:** `backend/luma/agents/coach.py` — `_compress_thread_if_needed()` (line 283)  
**Triggered by:** Inline, at start of every `coach_stream()` call when `len(messages) >= 30`

### Model
| Role | Model | Fallback |
|------|-------|---------|
| Primary | `gemini/gemini-2.5-flash` (inherits `coach_model`) | `anthropic/claude-haiku-4-5` (recommended, inherits `coach_fallback_model`) |

### Call Parameters
| Param | Value |
|-------|-------|
| Temperature | `0.2` |
| Timeout | `30.0s` |
| Streaming | No |
| Called via | `call_llm()` — **fully metrics-tracked** |

### System Prompt (verbatim)
```
Summarize the following conversation excerpt in 3-5 bullet points.
Focus on what the user asked, what data was retrieved, and what conclusions
were reached. Be terse — this summary will be injected as context for the coach.
```

### User Prompt Template
```
[USER]: {message 1 content}

[ASSISTANT]: {message 2 content}

[USER]: {message 3 content}
...
```
(All messages older than the last 10; tool and system messages excluded.)

### System Memory
No prior state — produces a one-shot summary persisted to the DB as `is_summary=TRUE`. Failure falls back to truncation (keeps last 10 messages).

### Token Budget
| Part | Estimated Tokens |
|------|-----------------|
| System | ~55 |
| Messages to compress (~20 typical) | ~3,000–6,000 |
| Output (3–5 bullets) | ~80–150 |
| **Total per call** | **~3,100–6,200** |

### Example Output
```
• User asked whether their HRV drop this week was diet-related; coach retrieved 7-day HRV and nutrition data
• Data showed HRV dip coincided with two high-sat-fat days (16g+ each)
• Coach suggested swapping dinner protein to fish twice weekly
• User confirmed they dislike salmon but would try cod or tilapia
• Open item: user wants to revisit this after trying changes for a week
```

---

## Summary Table

| Agent | File | Model (default) | Temp | Timeout | Streaming | Tools | ~Tokens/call |
|-------|------|----------------|------|---------|-----------|-------|-------------|
| Food Extractor | `agents/food_extractor.py` | `gemini/gemini-2.5-flash` | 0.1 | 180s | No | — | 700–1,400 |
| Vision Classifier | `api/log.py` | `gemini/gemini-2.5-flash` | 0.1 | 60s | No | — | 970–3,370 |
| Meal Planner | `agents/meal_planner.py` | `anthropic/claude-sonnet-4-5` | 0.2 | 600s | No | — | 4,700–13,700 |
| Coach | `agents/coach.py` | `gemini/gemini-2.5-flash` | 0.5 | 60s | Yes (SSE) | 7 | 3,500–8,600 |
| Insight Narrator | `agents/insight_narrator.py` | `gemini/gemini-2.5-flash` | 0.4 | 30s | No | — | 260–480 |
| Case File Updater | `services/coach_context.py` | `gemini/gemini-2.5-flash` | 0.2 | 45s | No | — | 2,600–21,000 |
| Thread Compressor | `agents/coach.py` | `gemini/gemini-2.5-flash` | 0.2 | 30s | No | — | 3,100–6,200 |

---

## Enhancements Applied (2026-05-30)

| # | Issue | Fix | Files |
|---|-------|-----|-------|
| 1 | Insight Narrator used Claude Sonnet for a 3-field JSON task | Switched default to `gemini/gemini-2.5-flash` (~10× cheaper) | `config.py` |
| 2 | All fallback models blank by default | Added recommended cross-provider fallbacks to `.env.example` | `.env.example` |
| 3 | Meal planner prompt said "You are Claude" | Fixed to "You are Luma's clinical nutrition orchestrator" | `meal_planner.py` |
| 4 | Meal planner injected all foods regardless of allergens/dislikes | Fetch 300, filter by exclusion terms, inject best 100 | `meal_planner.py` |
| 5 | Food extractor prompt said "minified" but showed pretty JSON | Removed contradiction; instruction now says "valid JSON array" | `food_extractor.py` |
| 6 | Food extractor silently returned `[]` on JSON parse failure | Added one-shot correction retry before giving up | `food_extractor.py` |
| 7 | Thread compressor bypassed `call_llm()`, invisible in metrics | Re-routed through `call_llm()` with fallback support | `coach.py` |
| 8 | Vision classifier had no system message | Added persona + JSON discipline system message | `api/log.py` |
| 9 | Vision classifier silently returned `[]` on JSON parse failure | Added one-shot correction retry (image remains in context) | `api/log.py` |
| 10 | Vision classifier prompt showed `0` as example nutrient values | Example now shows realistic non-zero values with explicit instruction to fill them | `api/log.py` |

## Open Items (deferred)

- **Prompt versioning** — All prompts are inline strings with no A/B testing or rollback mechanism. Requires a prompt registry design; deferred to Phase 3 planning.
- **`propose_meal_swap` tool stub** — Returns a templated string rather than querying the foods table. Needs a real implementation in Phase 2.
- **Meal planner timeout** — `600s` blocking timeout is long for a UI request. A background job approach would be more resilient; deferred pending Phase 2 UX decisions.
- **Case file transcript token bounding** — Currently bounded by message count (200 msgs), not token count. A high-volume user could hit expensive calls. Low priority until usage data available.
