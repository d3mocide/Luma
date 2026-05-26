# Lumo — Status

Last updated: 2026-05-26

## Phase 0 — Foundations

**Status: code-complete, not yet verified against running infrastructure**

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

### Still Needed to Close Phase 0
- [ ] **Verify compose stack comes up clean** — `docker compose up -d`, check all health checks pass
- [ ] **Run `alembic upgrade head`** against real TimescaleDB and confirm hypertables + CAgg created
- [ ] **Run `seed_admin.py`** and confirm login returns 200
- [ ] **Smoke test HAE ingest** — POST with valid HMAC, confirm row lands in `biometrics`
- [ ] **Run `pnpm build`** in `web/` and confirm TypeScript compiles clean
- [ ] **Point HAE** at `https://<host>/api/v1/ingest/hae` — operator setup task
- [ ] **Nginx TLS certs** — drop real certs into `certs/` or wire Let's Encrypt/Caddy

---

## Phase 1 — Logging + Plan  🔒 LOCKED

Unlock when all Phase 0 exit criteria pass.

### Backend
- [ ] `POST /log/meal/voice` — multipart audio → Whisper → food-extractor (Llama3) → draft meal event
- [ ] `POST /log/meal/barcode` — barcode → OFF local cache → food + portion picker
- [ ] `POST /log/meal` — save confirmed meal event
- [ ] `PATCH|DELETE /log/meal/{id}`
- [ ] `GET /foods/search` — pg_trgm fuzzy search against foods table
- [ ] `POST /foods` — user-added food
- [ ] OFF on-demand barcode fallback (`services/off_client.py`)
- [ ] Monthly OFF JSONL dump ingest worker task
- [ ] USDA Foundation + SR Legacy ingest (`scripts/ingest_usda.py`)
- [ ] Food extractor agent (`agents/food_extractor.py`) — Llama3 local
- [ ] Meal planner agent (`agents/meal_planner.py`) — Claude Sonnet
- [ ] `POST /plan/regenerate` — generates 7-day plan from goals + preferences
- [ ] `GET /plan/current` + `GET /plan?week=`
- [ ] `POST /plan/slot/{id}/swap` — LLM proposes 3 alternatives
- [ ] `POST /plan/{id}/log-as-eaten/{slot_id}`
- [ ] `GET /plan/{id}/shopping-list`
- [ ] Adherence ring on Today — real computation from meal_events vs goals

### Frontend
- [ ] Log sheet (`LogSheet/`) — Voice / Barcode / Search tabs
- [ ] Hold-to-record voice UI → upload → review extracted items → confirm
- [ ] Barcode scanner UI (`html5-qrcode`)
- [ ] Plan screen — 7-day list, slot drawer with Log/Swap/Edit
- [ ] Regenerate plan modal with constraints
- [ ] Shopping list view
- [ ] Recipes list + detail view

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
