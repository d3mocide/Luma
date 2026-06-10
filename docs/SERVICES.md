# Services Reference

Detailed reference for every container in the Luma Docker Compose stack.

---

## Overview

| Service | Image | Exposes (host) | Exposes (internal) | Purpose |
|---|---|---|---|---|
| `frontend` | `./frontend` (multi-stage Vite + Nginx build) | `80`, `443` | — | TLS termination, static PWA serving, API reverse proxy |
| `frontend-dev` | `node:22-alpine` | `5173` | — | Vite dev server with hot reload (profile: `dev`) |
| `api` | `./backend` | — | `8000` | FastAPI application server |
| `worker` | `./backend` (same image) | — | — | arq background task worker |
| `postgres` | `timescale/timescaledb-ha:pg16-ts2.16` | — | `5432` | Primary database |
| `redis` | `redis:7-alpine` | — | `6379` | Task queue and session cache |
| `whisper` | `./whisper` | — | `9000` | Faster-Whisper speech-to-text service |

All services (except `frontend`) run with `restart: unless-stopped`.

---

## `frontend`

**Purpose:** Terminates TLS, serves the compiled React PWA as static files, and reverse-proxies `/api` requests to the `api` service.

**Image:** Built from `./frontend/Dockerfile`. Multi-stage build — Stage 1 runs `pnpm build` inside Node 22 to produce the Vite output; Stage 2 copies the static assets into an Nginx Alpine image.

**Ports (host):**

| Port | Protocol | Description |
|---|---|---|
| `LUMA_HTTP_PORT` (default 80) | HTTP | Redirects to HTTPS |
| `LUMA_HTTPS_PORT` (default 443) | HTTPS | Main entry point |

**Volumes:**

| Volume | Mount | Description |
|---|---|---|
| `nginx_certs` | `/etc/nginx/certs` | TLS certificate storage. `setup_dev.sh` pre-populates this with a self-signed cert. Swap in real certs here for production. |

**Configuration:** `nginx/nginx.conf` and `nginx/docker-entrypoint.sh`. The entrypoint script generates a self-signed certificate on first start if none exists in the volume.

**Health check:** `curl -sf https://localhost/health || exit 1`

**Key environment variables:**

| Variable | Used for |
|---|---|
| `LUMA_PROXY_MODE` | When `true`, disables Nginx TLS and serves plain HTTP |
| `LUMA_DOMAIN` | SAN in generated self-signed certificate |

---

## `frontend-dev`

**Purpose:** Vite dev server for hot-module-replacement during frontend development. Not started by `make prod` — only active when the `dev` Compose profile is requested (`make dev`).

**Image:** `node:22-alpine` with `pnpm` installed.

**Ports (host):** `5173`

**Volumes:**

| Volume | Mount | Description |
|---|---|---|
| `./frontend` | `/app` | Source directory bind-mounted for live edits |
| `frontend_node_modules` | `/app/node_modules` | Named volume prevents host `node_modules` from shadowing the container install |

**Vite proxy:** The Vite config inside the container proxies `/api` → `http://api:8000`, so the dev server behaves identically to the production Nginx proxy. No frontend code changes are needed between dev and prod.

**Key environment variables:**

| Variable | Effect |
|---|---|
| `VITE_USE_MOCK_DATA=1` | Enables the mock API layer; no live backend required |

---

## `api`

**Purpose:** The FastAPI application server. Handles all HTTP API requests, manages the database session, calls LLM endpoints, and queues background tasks in Redis.

**Image:** Built from `./backend/Dockerfile`. Runs as `uvicorn luma.main:app --host 0.0.0.0 --port 8000`.

**Ports (internal):** `8000` (not exposed to host; only reachable via Nginx)

**Dependencies:** Waits for `postgres` and `redis` to pass their health checks before starting.

**Startup behaviour:** On container start, the API runs `alembic upgrade head` via an init hook to ensure the schema is always current. This means `make migrate` is also safe to run explicitly at any time — it is idempotent.

**Health check:** `curl -sf http://localhost:8000/health || exit 1`

**Key environment variables:** See [docs/SETUP.md](SETUP.md) for the full reference. Core variables consumed by the API:

- `DATABASE_URL`, `REDIS_URL`
- `JWT_SECRET`, `JWT_ALGORITHM`, access/refresh expiry
- `HAE_SHARED_SECRET`
- All `*_MODEL` and `*_FALLBACK_MODEL` LLM routing variables
- `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `LOCAL_AI_API_BASE`
- `WHISPER_URL`
- `ENVIRONMENT`, `CORS_ORIGINS`

---

## `worker`

**Purpose:** arq background task worker. Runs the same Python application image as `api` but with a different entrypoint: `arq luma.worker.settings.WorkerSettings`.

**Image:** Same as `api` — `./backend/Dockerfile`.

**Ports:** None — this service does not accept inbound connections.

**Task queue:** Pulls jobs from Redis. Current tasks:

| Task | Schedule | Description |
|---|---|---|
| OFF monthly ingest | Monthly | Downloads the Open Food Facts JSONL dump and merges new foods into the local database |
| Alert engine | Every 30 min | Evaluates 10+ deterministic health rules + IsolationForest anomaly detection + SQL trend reversal against recent biometrics and meals |
| Insight generation | On new alert | Calls the insight narrator agent to generate human-readable headlines for new alerts |
| Weekly recap | Sunday (server TZ) | Narrates a 7-day nutrition and weight summary; dispatches push notification if subscriptions exist |
| Push nudges | Per-user schedule | Delivers personalised nudges based on user activity and goals, respecting per-user timezone |
| Family invite email | On-demand | Sends invitation email when a user is added to a family group |

**Key environment variables:** Same as `api` — both services share the same image and config.

---

## `postgres`

**Purpose:** Primary relational database with TimescaleDB extension for time-series hypertables and continuous aggregates.

**Image:** `timescale/timescaledb-ha:pg16-ts2.16`

**Ports (internal):** `5432`

**Volumes:**

| Volume | Mount | Description |
|---|---|---|
| `pgdata` | `/home/postgres/pgdata/data` | Persistent database files. This volume must not be deleted unless you intend to destroy all data. |

**Health check:** `pg_isready -U sh -d luma` (run every 10 seconds, 5-second timeout, 5 retries before unhealthy)

**Initialisation:** On first start, the TimescaleDB image creates the `luma` database and the `sh` user using `PG_PASSWORD`. Subsequent starts skip this step. Schema is applied by `alembic upgrade head` (run by the `api` container on start).

**Key environment variables:**

| Variable | Description |
|---|---|
| `PG_PASSWORD` | Password for the `sh` database user |
| `DATABASE_URL` | Full async SQLAlchemy connection string consumed by `api` and `worker` |

---

## `redis`

**Purpose:** Broker for the arq task queue and session/cache storage.

**Image:** `redis:7-alpine`

**Ports (internal):** `6379`

**Volumes:**

| Volume | Mount | Description |
|---|---|---|
| `redisdata` | `/data` | Persistent AOF (append-only file) log. Survives container restarts. |

**Persistence:** AOF is enabled (`appendonly yes`), so queued tasks and any cached state survive a container restart. If the `redisdata` volume is deleted, any queued but un-started arq tasks will be lost (completed tasks are not stored).

**Health check:** `redis-cli ping` (returns `PONG`)

---

## `whisper`

**Purpose:** HTTP wrapper around Faster-Whisper for speech-to-text transcription of voice meal log recordings.

**Image:** Built from `./whisper/Dockerfile`. Runs a lightweight Flask-style HTTP server (`whisper/server.py`) that exposes a `/transcribe` endpoint.

**Ports (internal):** `9000`

**Volumes:**

| Volume | Mount | Description |
|---|---|---|
| `whisper_model_cache` | `/root/.cache/huggingface` | Hugging Face model cache. `base.en` is baked into the image; other model sizes download here on first request. |

**Health check:** `curl -sf http://localhost:9000/health || exit 1`

**Model selection:** Set `WHISPER_MODEL` in `.env`. The `base.en` model is included in the Docker image (~150 MB). Larger models are downloaded on first start and cached in the volume:

| Model | Size (approx) | Notes |
|---|---|---|
| `tiny.en` | ~75 MB | Fast; lower accuracy |
| `base.en` | ~150 MB | **Default** — baked into image |
| `small.en` | ~490 MB | Better accuracy; downloads on first start |
| `medium.en` | ~1.5 GB | High accuracy; requires more RAM |
| `large-v3` | ~3 GB | Best accuracy; multi-language |

**How it's used:** The `api` service calls `POST http://whisper:9000/transcribe` with a multipart audio file (WebM from the browser's MediaRecorder). The response is a JSON object with a `text` field containing the transcript, which is then passed to the food extractor agent.

---

## Volumes Summary

| Volume | Owner | Contains | Safe to delete? |
|---|---|---|---|
| `pgdata` | postgres | All application data | ❌ Destroys all data |
| `redisdata` | redis | Task queue state, cache | ⚠️ Queued tasks lost |
| `nginx_certs` | frontend | TLS certificate and key | ⚠️ Regenerated on next start (self-signed) |
| `frontend_node_modules` | frontend-dev | Node.js dependencies | ✅ Reinstalled automatically |
| `whisper_model_cache` | whisper | Downloaded Whisper models | ✅ Re-downloaded on next start |
