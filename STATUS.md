# Luma — Status

Last updated: 2026-05-29

## Phase 0 — Foundations

**Status: VERIFIED & STABILIZED**

### Done
- [x] `compose.yml` — all services with health checks (postgres/TimescaleDB, redis, api, worker, nginx, litellm [remote AI], whisper)
- [x] Alembic migration `0001_initial` — all 13 relational tables + 3 hypertables (biometrics, meal_events, alerts) + `biometrics_daily` continuous aggregate
- [x] `POST /api/v1/auth/login|logout|refresh` + `GET /auth/me` — Argon2id + JWT, HTTP-only cookies
- [x] `POST /api/v1/ingest/hae` — HMAC-SHA256 verified + replay protection (Redis nonce, 10-min TTL); normalizes all 24 HAE metric types + computed `sleep_score` into biometrics
- [x] `GET /api/v1/today` — live biometric query + weight slope; `biometrics_latest` surfaces 10 fields (hrv, rhr, heart rate, sleep score/duration, steps, active kcal, BMR, exercise, respiratory rate)
- [x] `GET /api/v1/trends/{metric}` — queries `biometrics_daily` CAgg, supports 7d/30d/90d/1y; allowlist covers all 30 ingested metric names
- [x] `GET|PUT /api/v1/goals` + `GET|POST|DELETE /api/v1/preferences` — full CRUD
- [x] All Phase 1+ API routes wired but stubbed (`log`, `plan`, `coach`, `foods`, `recipes`)
- [x] `scripts/seed_admin.py`
- [x] Frontend shell — AppShell with bottom nav (mobile) + sidebar (desktop)
- [x] Today screen — weight hero, adherence pills, plan cards, biometrics strip (queries live API); strip expanded with Steps and Active cal tiles
- [x] Trends screen — Recharts line charts per metric with range toggle (queries live API)
- [x] Plan / Coach / Settings routes — wired, Phase 1/2 placeholder UI
- [x] PWA manifest + Vite PWA plugin + service worker config
- [x] `CLAUDE.md` + `AGENTS.md` working agreements
- [x] **Verify compose stack comes up clean** — health checks verified green
- [x] **Run `alembic upgrade head`** — verified 100% schema parity with no autogenerate drift (`alembic check` clean)
- [x] **Run `seed_admin.py`** — verified administrator seeding successfully
- [x] **Smoke test HAE ingest** — verified valid HMAC signatures and data ingestion; 29-test suite covers normalizer, sleep_analysis path, sleep_score formula, HMAC verification, and replay protection
- [x] **Run `pnpm build`** — verified production build compilation with zero errors
- [x] **Point HAE** at local endpoint for end-to-end telemetry pipeline
- [x] **Nginx TLS certs** — added automated `setup_dev.sh` script to auto-generate secure developer credentials and certificates on host initialization

---

## Phase 1 — Logging + Plan  ✅ COMPLETED

Fully implemented, verified, stabilized, and bug-fixed.

### Backend
- [x] `POST /log/meal/voice` — multipart audio → Whisper → food-extractor (Llama3) → draft meal event
- [x] `POST /log/meal/barcode` — barcode → OFF local cache → food + portion picker
- [x] `POST /log/meal/text` — plain-text description → food-extractor (Llama3) → draft meal event
- [x] `POST /log/meal` — save confirmed meal event
- [x] `PATCH|DELETE /log/meal/{id}`
- [x] `GET /foods/search` — pg_trgm fuzzy search against foods table
- [x] `POST /foods` — user-added food
- [x] OFF on-demand barcode fallback (`services/off_client.py`)
- [x] Monthly OFF JSONL dump ingest worker task
- [x] USDA Foundation + SR Legacy ingest (`scripts/ingest_usda.py`)
- [x] Food extractor agent (`agents/food_extractor.py`) — Llama3 local
- [x] Meal planner agent (`agents/meal_planner.py`) — Claude Sonnet
- [x] `POST /plan/regenerate` — generates 7-day plan from goals + preferences
- [x] `GET /plan/current` + `GET /plan?week=`
- [x] `POST /plan/slot/{id}/swap` — LLM proposes 3 alternatives
- [x] `POST /plan/{id}/log-as-eaten/{slot_id}`
- [x] `GET /plan/{id}/shopping-list`
- [x] Adherence rings on Today — real computation from today's meal_events vs goals
- [x] Streak computation on Today — consecutive logged days (UTC), grace period before midnight
- [x] pytest coverage — 11 tests covering meal CRUD round-trip, auth gating, cross-user isolation

### Frontend
- [x] Log sheet (`LogSheet/`) — Voice / Barcode / Search tabs
- [x] Hold-to-record voice UI → upload → review extracted items → confirm
- [x] Voice preset buttons — route through real `/log/meal/text` LLM pipeline (no more hardcoded mock data)
- [x] Barcode scanner UI (`html5-qrcode`) + text-entry fallback
- [x] Plan screen — 7-day list, slot drawer with Log/Swap/Edit
- [x] Plan log-as-eaten wired to Recent Meals via `plan_slot_id` FK (was broken: slot-name matching)
- [x] Regenerate plan modal with constraints
- [x] Shopping list view
- [x] Recipes list + detail view
- [x] Meal delete UI on Recent Meals card (trash icon, optimistic fade)
- [x] NutritionCalculatorCard quick-add sends all 8 nutrients (was only 3)
- [x] Streak strip wired to live `streak_days` from `/today` API

---

## Phase 2 — Intelligence  🔓 CURRENT

### Backend
- [ ] Alert engine — all 8 deterministic rules (`alerts/rules.py`, `alerts/engine.py`)
  - Sat fat over 7-day rolling average
  - Soluble fiber consistently under target
  - Weight trend diverging from goal trajectory
  - HRV drop correlated with poor sleep
  - Calorie deficit too aggressive (>500 kcal/day average)
  - Logging streak broken after 3+ days
  - LDL-risk foods (high sat fat + low fiber day)
  - Positive milestone (e.g. 7-day streak, target weight approach)
- [ ] `alerts` scheduled worker task via arq (every 30 min)
- [ ] Insight narrator agent (`agents/insight_narrator.py`) — Claude Sonnet; headline + body + thread_seed
- [ ] `GET /insights` + `POST /insights/{id}/ack`
- [ ] Coach agent with tool calls (`agents/coach.py`) — Claude Sonnet, streaming SSE
- [ ] `POST /coach/threads` + `POST /coach/threads/{id}/messages` — SSE streaming
- [ ] Coach tool implementations:
  - `query_biometric_trend` — fetch trend series for a metric + date range
  - `query_nutrition_rollup` — daily/weekly nutrition averages
  - `get_recent_meals` — last N meal events with full nutrition
  - `propose_meal_swap` — LLM swaps a slot respecting LDL goals
  - `modify_plan` — writes a new plan slot on behalf of user

### Frontend
- [x] Weekly plan calendar navigation — WeekNav component, week-by-week browsing with prev/next arrows, status dots on weeks with plans, "Today" snap, end-of-week nudge banner, context-aware empty states
- [x] Plan page week-driven queries — `GET /plan/weeks` + `GET /plan/week/{date}` endpoints; plan page selects week independently of current date; generate sends explicit `week_start`
- [x] Quick combo log widget — "Combo" tab in log sheet; multi-ingredient picker with per-ingredient gram input, live kcal/protein preview, named combos; logs as single MealEvent with `source: combo`
- [ ] Today screen `active_insight` slot wired to real alerts (currently returns `null`)
- [ ] Trends screen — alert annotation pins on timeline (vertical markers at alert timestamps)
- [ ] Drill-down sheet — tap any chart point → meals logged that day
- [ ] Coach screen — full SSE streaming chat, tool-call progress indicators
- [ ] Photo logging path — `POST /log/meal/photo` → Claude vision → same draft flow as voice
- [ ] PWA offline — service worker caches last-known `/today` payload; shows stale banner
- [ ] PWA install prompt — deferred install banner on mobile after 3rd visit

---

## Phase 3 — Polish  🔒 LOCKED

### Committed scope
- [ ] Repeat-meal detection on Log sheet — "Usual breakfast?" one-tap re-log based on last 7-day frequency
- [ ] Shopping list export to iOS Reminders via `x-apple-reminderkit://` deep link
- [ ] ML anomaly detection (`alerts/ml.py`) — Prophet for weight trend forecasting, IsolationForest for biometric outliers
- [ ] Multi-user / family support — `role = family | viewer`, read-only sharing link
- [ ] Web Bluetooth direct scale path — Bluefy integration as HAE alternative for weight
- [ ] Push notifications — PWA push API for daily nudge at user-configured time

### Meal plan overhaul backlog (approved for Phase 3)
- [ ] Slot lock/pin — user pins individual plan slots so they survive regeneration; locked slots passed as constraints to LLM on next generate
- [ ] Weekly nutrition summary bar — aggregate avg calories / sat-fat / sol-fiber vs goals shown above the calendar grid; data already in `day_totals`
- [ ] Per-slot AI alternatives — "Suggest 3 alternatives" action on any slot; lightweight LLM call with slot context + user goals; returns swappable options without full plan regeneration
- [ ] Recipe / composite meal builder — `recipes` table migration; user defines named meal as ingredient list with gram amounts; placeable in any plan slot or loggable as MealEvent; `meal_plan_slots.recipe_id` FK already exists
- [ ] Drag slot between days — drag-and-drop reorder within plan calendar grid

### Coach / insights backlog (approved for Phase 3)
- [ ] Proactive weekly recap — end-of-week coach message summarising LDL-relevant wins and misses; triggered by arq worker on Sunday evening
- [ ] Trend-aware nudges — if weight or LDL-proxy metrics stall for 2+ weeks, surface a coach prompt suggesting plan adjustments

### Future enhancement ideas (post-Phase 3)
- **Wearable-native integrations** — Garmin Connect IQ data bridge, Oura Ring API (HRV, readiness score), Withings scale direct sync
- **Recipe import** — paste any URL → Claude extracts ingredients + nutrition; store as user recipe
- **Barcode camera scan** — replace text-entry fallback with `html5-qrcode` live camera in BarcodeTab
- **Meal photo history** — gallery view of logged photos with detected items overlaid
- **LDL simulator** — "what if" tool: adjust sat fat / fiber targets and project estimated LDL impact over 8 weeks using established risk equations
- **Export / data portability** — CSV and JSON export of all biometrics + meal logs; importable into Apple Health / Google Fit
- **Cronometer-style nutrient breakdown** — full micro/macronutrient detail view per meal (beyond the 8 tracked)
- **Adaptive plan regeneration** — auto-regenerate plan mid-week if 2+ slots are unlogged, instead of waiting for manual trigger
- **Voice wake word** — "Hey Luma, log breakfast" via Web Speech API continuous mode
- **Smart grocery integration** — generate Instacart / AmazonFresh shopping cart from shopping list deep link
- **Seasonal eating suggestions** — coach aware of in-season produce at user's location for cheaper, fresher plan slots
- **Medication interaction awareness** — flag meals high in vitamin K if user has noted warfarin; grapefruit + statins alert
- **Community recipes** — opt-in recipe sharing across self-hosted instances via ActivityPub-style federation

---

## Infrastructure / Ops (ongoing)

- [ ] CI — `alembic upgrade head` + `pytest` on every push
- [ ] Log rotation config for nginx
- [ ] Backup cron for postgres volume
- [ ] Remote Local AI setup & model dependencies documented (e.g. `llama3.1:8b-instruct`, `moondream2`)
- [ ] `.env` secret generation documented (openssl rand -hex 32)
