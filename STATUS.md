# Lumo — Status

Last updated: 2026-05-26

## Phase 0 — Foundations

**Status: VERIFIED & STABILIZED**

### Done
- [x] `compose.yml` — all services with health checks (postgres/TimescaleDB, redis, api, worker, nginx, litellm [remote AI], whisper)
- [x] Alembic migration `0001_initial` — all 13 relational tables + 3 hypertables (biometrics, meal_events, alerts) + `biometrics_daily` continuous aggregate
- [x] `POST /api/v1/auth/login|logout|refresh` + `GET /auth/me` — Argon2id + JWT, HTTP-only cookies
- [x] `POST /api/v1/ingest/hae` — HMAC-SHA256 verified, normalizes all 9 HAE metric types into biometrics
- [x] `GET /api/v1/today` — live biometric query + weight slope; returns real data where available, nulls otherwise
- [x] `GET /api/v1/trends/{metric}` — queries `biometrics_daily` CAgg, supports 7d/30d/90d/1y
- [x] `GET|PUT /api/v1/goals` + `GET|POST|DELETE /api/v1/preferences` — full CRUD
- [x] All Phase 1+ API routes wired but stubbed (`log`, `plan`, `coach`, `foods`, `recipes`)
- [x] `scripts/seed_admin.py`
- [x] Frontend shell — AppShell with bottom nav (mobile) + sidebar (desktop)
- [x] Today screen — weight hero, adherence pills, plan cards, biometrics strip (queries live API)
- [x] Trends screen — Recharts line charts per metric with range toggle (queries live API)
- [x] Plan / Coach / Settings routes — wired, Phase 1/2 placeholder UI
- [x] PWA manifest + Vite PWA plugin + service worker config
- [x] `CLAUDE.md` + `AGENTS.md` working agreements
- [x] **Verify compose stack comes up clean** — health checks verified green
- [x] **Run `alembic upgrade head`** — verified 100% schema parity with no autogenerate drift (`alembic check` clean)
- [x] **Run `seed_admin.py`** — verified administrator seeding successfully
- [x] **Smoke test HAE ingest** — verified valid HMAC signatures and data ingestion
- [x] **Run `pnpm build`** — verified production build compilation with zero errors
- [x] **Point HAE** at local endpoint for end-to-end telemetry pipeline
- [x] **Nginx TLS certs** — added automated `setup_dev.sh` script to auto-generate secure developer credentials and certificates on host initialization

---

## Phase 1 — Logging + Plan  ✅ COMPLETED

Fully implemented, verified, and stabilized.

### Backend
- [x] `POST /log/meal/voice` — multipart audio → Whisper → food-extractor (Llama3) → draft meal event
- [x] `POST /log/meal/barcode` — barcode → OFF local cache → food + portion picker
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
- [x] Adherence ring on Today — real computation from meal_events vs goals

### Frontend
- [x] Log sheet (`LogSheet/`) — Voice / Barcode / Search tabs
- [x] Hold-to-record voice UI → upload → review extracted items → confirm
- [x] Barcode scanner UI (`html5-qrcode`)
- [x] Plan screen — 7-day list, slot drawer with Log/Swap/Edit
- [x] Regenerate plan modal with constraints
- [x] Shopping list view
- [x] Recipes list + detail view

---

## Phase 2 — Intelligence  🔒 LOCKED

- [ ] Alert engine — all 8 deterministic rules (`alerts/rules.py`, `alerts/engine.py`)
- [ ] `alerts` scheduled worker task (every 30 min)
- [ ] Insight narrator agent — headline + body + thread_seed
- [ ] `GET /insights` + `POST /insights/{id}/ack`
- [ ] Today screen `active_insight` slot wired to real alerts
- [ ] Coach agent with tool calls (`agents/coach.py`) — streaming SSE
- [ ] `POST /coach/threads/{id}/messages` — full SSE streaming
- [ ] Coach tool implementations: `query_biometric_trend`, `query_nutrition_rollup`, `get_recent_meals`, `propose_meal_swap`, `modify_plan`
- [ ] Trends screen — annotation pins on chart for fired alerts
- [ ] Drill-down sheet (tap chart point → meals that day)
- [ ] Photo logging path — `POST /log/meal/photo` → Claude vision (fallback)
- [ ] PWA offline: service worker caches last-known `/today` payload
- [ ] PWA install prompt

---

## Phase 3 — Polish  🔒 LOCKED

- [ ] Repeat-meal detection on Log sheet ("Usual breakfast?" one-tap)
- [ ] Shopping list export to iOS Reminders (deep link)
- [ ] ML anomaly detection (`alerts/ml.py`) — Prophet or IsolationForest
- [ ] Multi-user / family support (role = family | viewer)
- [ ] Web Bluetooth direct scale path (Bluefy, optional HAE alternative)
- [ ] Push notifications (PWA push for daily nudge)

---

## Infrastructure / Ops (ongoing)

- [ ] CI — `alembic upgrade head` + `pytest` on every push
- [ ] Log rotation config for nginx
- [ ] Backup cron for postgres volume
- [ ] Remote Local AI setup & model dependencies documented (e.g. `llama3.1:8b-instruct`, `moondream2`)
- [ ] `.env` secret generation documented (openssl rand -hex 32)
