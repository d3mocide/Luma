<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="frontend/public/assets/luma-wordmark-dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="frontend/public/assets/luma-wordmark-light.svg">
    <img src="frontend/public/assets/luma-wordmark-dark.svg" alt="Luma" width="280"/>
  </picture>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Python_3.12-0ea5e9?style=flat-square&logo=python&logoColor=white" alt="Python 3.12"/>
  <img src="https://img.shields.io/badge/FastAPI-0ea5e9?style=flat-square&logo=fastapi&logoColor=white" alt="FastAPI"/>
  <img src="https://img.shields.io/badge/React_18-38bdf8?style=flat-square&logo=react&logoColor=white" alt="React 18"/>
  <img src="https://img.shields.io/badge/TypeScript-38bdf8?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript"/>
  <img src="https://img.shields.io/badge/TimescaleDB-0ea5e9?style=flat-square&logo=timescale&logoColor=white" alt="TimescaleDB"/>
  <img src="https://img.shields.io/badge/Docker_Compose-0ea5e9?style=flat-square&logo=docker&logoColor=white" alt="Docker Compose"/>
  <img src="https://img.shields.io/badge/PWA-fbbf24?style=flat-square&logo=pwa&logoColor=black" alt="PWA"/>
</p>

---

Luma is a self-hosted personal health assistant built for long-term weight and nutrition management. It ingests biometric data from wearables and smart scales, helps you plan and log meals against personalised targets, and surfaces trends over time — all running on your own hardware, with your data never leaving your network.

## Features

| Capability | Status | Description |
|---|:---:|---|
| **Biometric Ingest** | ✅ Live | HAE webhook with HMAC-SHA256 — weight, body fat, blood pressure, HRV, glucose, and more |
| **Today Dashboard** | ✅ Live | Weight trend hero, daily adherence ring, active plan preview, and biometric strip |
| **Trend Charts** | ✅ Live | Interactive 7 d / 30 d / 90 d / 1 y charts for every tracked metric via TimescaleDB continuous aggregates |
| **Goals & Preferences** | ✅ Live | Per-user calorie, sat-fat, and soluble-fibre targets; metric or imperial units |
| **Meal Logging** | ✅ Live | Voice (Whisper STT → LLM extraction), barcode scanner (Open Food Facts), or fuzzy food search |
| **Meal Planning** | ✅ Live | AI-generated 7-day plan with per-slot nutrition, food-browser swaps, and shopping list export |
| **Food Database** | ✅ Live | Local pg_trgm cache + Open Food Facts + USDA FoodData Central live fallback |
| **Alerts & Insights** | 🔒 Phase 2 | Eight deterministic health rules + LLM-narrated insight headlines |
| **Coaching Chat** | 🔒 Phase 2 | Streaming AI coach with direct tool access to your biometric and meal data |
| **Anomaly Detection** | 🔒 Phase 3 | Prophet / IsolationForest ML on long-horizon biometric trends |

## Architecture

Luma is a Docker Compose stack of six services. All internal communication happens on a private Docker network — only Nginx is exposed to the host.

```
Host (80 / 443)
  └─ nginx ──► frontend   React PWA (Vite production build)
           ──► api        FastAPI / Uvicorn  :8000
                    ├──► postgres   TimescaleDB 16  :5432
                    ├──► redis      Redis 7          :6379
                    └──► whisper    Faster-Whisper   :9000
  └─ worker   arq background tasks (same image as api)
```

LLM inference is handled in-process via the `litellm` SDK — no separate container. Each AI role (food extraction, meal planning, coaching, insight narration) is routed independently to local Ollama or cloud providers, configured entirely through environment variables.

For a full architectural breakdown including the database schema and data-flow diagrams, see **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

---

## Getting Started

### Prerequisites

- **Docker** and **Docker Compose v2**
- **`openssl`** on your PATH (used by `make setup` to generate dev TLS certificates)
- An **Anthropic API key** for meal planning (or a local Ollama endpoint — see [docs/SETUP.md](docs/SETUP.md))

---

### Step 1 — Clone and configure

```bash
git clone https://github.com/d3mocide/luma.git
cd luma
make setup
```

`make setup` copies `.env.example` → `.env` and generates self-signed TLS certificates into the `nginx_certs` Docker volume. Open `.env` and fill in the required secrets:

```bash
# Generate strong secrets with:
openssl rand -hex 32

PG_PASSWORD=<strong-password>
JWT_SECRET=<openssl-output>
HAE_SHARED_SECRET=<openssl-output>

# LLM — choose one (or mix local + cloud per role):
ANTHROPIC_API_KEY=sk-ant-...
# or
LOCAL_AI_API_BASE=http://host.docker.internal:11434
MEAL_PLANNER_MODEL=local/llama3.1:8b-instruct
```

See **[docs/SETUP.md](docs/SETUP.md)** for the full environment variable reference and proxy-mode configuration.

---

### Step 2 — Start the stack

```bash
make prod
```

This builds all images and starts every service. Check that all health checks pass:

```bash
make ps
```

All services should show `healthy` or `running` within ~30 seconds. If Postgres takes longer on first boot (TimescaleDB initialises), the API will wait — this is expected.

---

### Step 3 — Run migrations and seed admin

```bash
make migrate    # runs: alembic upgrade head
make seed       # creates the first admin account (interactive prompt)
```

---

### Step 4 — Open Luma

Navigate to `https://localhost` in your browser. Accept the self-signed certificate warning (dev only — swap in a real cert for production). Log in with the admin credentials from Step 3.

---

### Step 5 — Connect a data source

Point your HAE-compatible app or device at your Luma endpoint:

```
POST https://<your-domain>/api/v1/ingest/hae
Content-Type: application/json
X-Luma-Signature: hmac-sha256=<hex-digest>

{ "metric": "weight_kg", "value": 82.4, "recorded_at": "2026-05-26T08:14:00Z" }
```

The signature is `HMAC-SHA256(HAE_SHARED_SECRET, request-body-bytes)` encoded as lowercase hex. See **[docs/SETUP.md § HAE Webhook](docs/SETUP.md#hae-webhook)** for the full format and all supported metric types.

---

## Development

Use the `dev` profile for Vite hot reload against the live backend:

```bash
make dev
```

Open `http://localhost:5173`. The Vite dev server proxies all `/api` requests to `api:8000` inside the Docker network.

**Mock mode** — iterate on UI with no backend required:

```bash
# In .env or as an override:
VITE_USE_MOCK_DATA=1
make dev
```

All major routes (Today, Trends, Plan, Settings) populate with realistic fixture data so you can tune the interface without a running backend.

See **[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)** for migrations, testing, local LLM setup, and coding conventions.

---

## Make Commands

| Command | Description |
|---|---|
| `make setup` | Initialise `.env` from example and generate dev TLS certificates |
| `make prod` | Build images and start the full production-style stack |
| `make dev` | Start the dev stack with Vite hot reload on `:5173` |
| `make stop` | Stop all running containers |
| `make down` | Stop and remove containers and networks |
| `make rebuild` | Rebuild all images and restart the stack |
| `make migrate` | Run `alembic upgrade head` inside the api container |
| `make seed` | Seed the first admin account |
| `make ps` | Show live service status |
| `make logs` | Tail logs across all services |
| `make logs-api` | Tail API service logs only |
| `make logs-web` | Tail frontend dev server logs |
| `make clean` | Remove stopped containers |
| `make nuke` | Destroy all containers, volumes, and networks — **irreversible** |

---

## Documentation

| Document | Contents |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Service map, database schema, data-flow walkthrough, LLM routing |
| [docs/SETUP.md](docs/SETUP.md) | Environment variables, TLS configuration, proxy mode, HAE webhook, secrets |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | Dev workflow, mock mode, migrations, testing, local LLM, coding conventions |
| [docs/SERVICES.md](docs/SERVICES.md) | Per-container reference — images, ports, volumes, health checks |

---

## License

Apache 2.0 — see [LICENSE](LICENSE).
