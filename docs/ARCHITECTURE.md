# Architecture

Luma is a self-contained Docker Compose application. This document describes the service topology, database schema, key data flows, and LLM routing strategy.

---

## Service Map

```
Host network (80 / 443)
│
└─ nginx ─────────────────────────────────────────────────────────────────
     │   TLS termination, static asset serving, API reverse proxy
     │
     ├──► frontend  (React PWA, served as static build from Vite)
     │
     └──► api  :8000  (FastAPI / Uvicorn, async throughout)
               │
               ├──► postgres  :5432   TimescaleDB 16 — primary data store
               ├──► redis     :6379   arq task queue + session cache
               └──► whisper   :9000   Faster-Whisper STT service

worker  (same Docker image as api, different entrypoint)
  └── consumes arq queues from redis
        ├─ OFF monthly JSONL dump ingest
        ├─ alert engine (Phase 2)
        └─ insight generation (Phase 2)
```

All services communicate on the `luma_default` internal Docker bridge network. Only `nginx` binds ports on the host — `api`, `postgres`, `redis`, and `whisper` are not reachable from outside the stack.

---

## LLM Routing

LLM inference is handled in-process via the [`litellm`](https://github.com/BerriAI/litellm) Python SDK — no separate proxy container. Each AI role is routed to an independent model endpoint, configured entirely through environment variables.

```
Role                  Env var                     Default
────────────────────  ──────────────────────────  ───────────────────────────
Food extraction       FOOD_EXTRACTOR_MODEL        gemini/gemini-2.5-flash
Vision classification VISION_CLASSIFIER_MODEL     gemini/gemini-2.5-flash
Meal planning         MEAL_PLANNER_MODEL          anthropic/claude-sonnet-4-5
Coaching chat         COACH_MODEL                 gemini/gemini-2.5-flash
Insight narration     INSIGHT_NARRATOR_MODEL      anthropic/claude-sonnet-4-5
```

**Provider prefixes:**

| Prefix | Routes to | Required secret |
|---|---|---|
| `anthropic/<model>` | Anthropic API | `ANTHROPIC_API_KEY` |
| `gemini/<model>` | Google Gemini API | `GEMINI_API_KEY` |
| `local/<model>` | `LOCAL_AI_API_BASE` (Ollama / any OpenAI-compatible endpoint) | `LOCAL_AI_API_KEY` (optional) |

Each role also accepts a `*_FALLBACK_MODEL` variable. If the primary call fails, litellm retries automatically with the fallback before raising to the caller.

---

## Database Schema

Luma uses PostgreSQL 16 with the TimescaleDB extension. The schema is managed entirely through Alembic migrations — never by hand.

### Relational tables

| Table | Description |
|---|---|
| `users` | Accounts, Argon2id password hash, role |
| `goals` | Per-user macro targets (calories, sat fat, soluble fibre, weight target) |
| `preferences` | Key/value user preferences (units, notification flags, etc.) |
| `foods` | Food items with full nutrition profile; sourced from OFF, USDA, and user additions |
| `recipes` | User-created recipe headers |
| `recipe_ingredients` | Recipe ↔ food join with quantity |
| `meal_plans` | Active and historical 7-day meal plans per user |
| `meal_plan_slots` | Individual slots within a plan; stores agent-estimated nutrition JSON |
| `shopping_list_items` | Per-slot shopping state with purchase toggle |
| `refresh_tokens` | Issued JWT refresh tokens with expiry and revocation flag |

### Hypertables (TimescaleDB)

| Table | Partition key | Description |
|---|---|---|
| `biometrics` | `recorded_at` | All raw metric readings ingested from HAE or manual entry |
| `meal_events` | `eaten_at` | Confirmed logged meals with full nutrition breakdown |
| `alerts` | `fired_at` | Health rule trigger events (Phase 2) |

### Continuous aggregate

`biometrics_daily` materialises daily average, min, max, and count for every metric per user. The `/trends/{metric}` endpoint queries this aggregate directly, making 7 d / 30 d / 90 d / 1 y range queries sub-millisecond regardless of raw biometric history size.

---

## Key Data Flows

### Biometric Ingest (HAE webhook)

```
External device / app
  POST /api/v1/ingest/hae
    │
    ├─ HMAC-SHA256 signature verified (constant-time)
    ├─ Payload normalised by hae_normalizer.py
    │    maps metric type names → canonical column names
    └─ Row inserted into biometrics hypertable
         TimescaleDB continuous aggregate refreshed automatically
```

### Meal Logging (voice path)

```
Browser (LogSheet.tsx)
  POST /api/v1/log/meal/voice  (multipart audio)
    │
    ├─ api → whisper:9000 /transcribe  (Faster-Whisper STT)
    │         returns transcript text
    │
    ├─ api → food_extractor agent
    │         litellm call to FOOD_EXTRACTOR_MODEL
    │         returns structured list of {name, quantity, unit}
    │
    └─ draft meal items returned to browser for review
         User confirms → POST /api/v1/log/meal
           row inserted into meal_events hypertable
```

### Meal Plan Generation

```
Browser (plan.tsx)
  POST /api/v1/plan/regenerate  (goals + dietary preferences)
    │
    ├─ meal_planner agent
    │   litellm call to MEAL_PLANNER_MODEL
    │   input: user goals, preferences, recent meal history
    │   output: 7-day slot structure with estimated nutrition
    │
    ├─ meal_plans row created
    ├─ meal_plan_slots rows created (nutrition JSON persisted)
    └─ GET /api/v1/plan/current returns full plan for rendering
```

---

## Frontend Architecture

The frontend is a React 18 PWA built with Vite.

| Concern | Library |
|---|---|
| Routing | React Router v6 |
| Server state | TanStack Query (all API calls) |
| Client state | Zustand (sheet open/close, theme, UI flags) |
| Components | shadcn/ui + Tailwind CSS |
| Charts | Recharts |
| Barcode scanning | html5-qrcode |
| PWA | vite-plugin-pwa + service worker |

The API client lives in `frontend/src/lib/api.ts`. All server calls go through TanStack Query hooks defined there — components never call `fetch` directly.

`VITE_USE_MOCK_DATA=1` swaps the real API client for `mock-api.ts`, which returns fixture data from `mock-data.ts`. This lets the full UI run without a backend.

---

## Authentication

- Passwords hashed with **Argon2id** via `argon2-cffi`
- Access tokens: **JWT HS256**, 15-minute expiry, signed with `JWT_SECRET`
- Refresh tokens: 7-day expiry, stored in `refresh_tokens` table with per-token revocation
- Tokens transported in **HTTP-only, Secure, SameSite=Strict cookies** — never in `localStorage`
- State-mutating routes require a matching **`X-CSRF-Token` header** (double-submit cookie pattern)
