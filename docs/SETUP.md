# Setup Guide

Everything needed to go from a fresh clone to a running Luma instance.

---

## Prerequisites

| Requirement | Notes |
|---|---|
| Docker Engine 24+ | With the Compose v2 plugin (`docker compose`, not `docker-compose`) |
| `openssl` | Used by `make setup` to generate dev TLS certificates |
| 2 GB free RAM | Whisper (`base.en`) uses ~250 MB; Postgres + API + Redis use ~1 GB combined |
| An outbound LLM key or local Ollama | Required for meal planning; food extraction can run locally |

---

## First-Time Setup

### 1. Clone and initialise

```bash
git clone https://github.com/d3mocide/luma.git
cd luma
make setup
```

`make setup` runs `setup_dev.sh`, which:
- Copies `.env.example` → `.env` (skips if `.env` already exists)
- Generates a self-signed TLS certificate and stores it in the `nginx_certs` Docker volume

### 2. Edit `.env`

Open `.env` and fill in all required values. Placeholders that begin with `changeme_` **must** be replaced before starting. Use `openssl rand -hex 32` to generate any 32-byte secret:

```bash
openssl rand -hex 32   # run once per secret
```

### 3. Build and start

```bash
make prod
```

### 4. Migrate

```bash
make migrate   # applies all Alembic migrations
```

### 5. Open and create the operator account

Navigate to `https://localhost`. Accept the browser's self-signed certificate warning in development.

On first boot, the login screen will switch into setup mode if no users exist yet. Create the initial operator account there.

`make seed` remains available as an optional bootstrap path for recovery, automation, or environments where browser-based setup is not practical.

---

## Environment Variables

### Deployment mode

| Variable | Default | Description |
|---|---|---|
| `LUMA_PROXY_MODE` | `false` | Set `true` when an upstream proxy (Nginx, Caddy, Traefik) handles TLS. See [Proxy Mode](#proxy-mode) below. |
| `LUMA_DOMAIN` | `localhost` | Hostname used in TLS certificate generation and CORS |
| `LUMA_HTTP_PORT` | `80` | Host port for HTTP |
| `LUMA_HTTPS_PORT` | `443` | Host port for HTTPS |

### Database

| Variable | Description |
|---|---|
| `PG_PASSWORD` | Password for the `sh` Postgres user |
| `DATABASE_URL` | Full async SQLAlchemy URL — change only if you move Postgres off the default service name |

### Cache

| Variable | Description |
|---|---|
| `REDIS_URL` | Redis connection URL. Default `redis://redis:6379/0` works for the bundled container. |

### Auth

| Variable | Description |
|---|---|
| `JWT_SECRET` | HS256 signing key — minimum 32 bytes of entropy (`openssl rand -hex 32`) |
| `JWT_ALGORITHM` | `HS256` — do not change |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Access token lifetime (default 15 min) |
| `REFRESH_TOKEN_EXPIRE_DAYS` | Refresh token lifetime (default 7 days) |

### HAE Webhook

| Variable | Description |
|---|---|
| `HAE_SHARED_SECRET` | HMAC-SHA256 signing secret — minimum 32 bytes (`openssl rand -hex 32`) |

### LLM Cloud Keys

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Required for `anthropic/<model>` routes (meal planner, insight narrator) |
| `GEMINI_API_KEY` | Required for `gemini/<model>` routes (food extractor, coach) |

### LLM Model Routing

Each role routes independently. Mix local and cloud freely.

| Variable | Default | Role |
|---|---|---|
| `LOCAL_AI_API_BASE` | _(empty)_ | Base URL for any OpenAI-compatible local endpoint (e.g. `http://host.docker.internal:11434` for Ollama) |
| `LOCAL_AI_API_KEY` | _(empty)_ | API key for local endpoint (most Ollama setups don't need this) |
| `FOOD_EXTRACTOR_MODEL` | `gemini/gemini-2.5-flash` | Voice transcript → structured meal items |
| `FOOD_EXTRACTOR_FALLBACK_MODEL` | _(empty)_ | Fallback if primary fails |
| `VISION_CLASSIFIER_MODEL` | `gemini/gemini-2.5-flash` | Photo → meal items (Phase 2) |
| `MEAL_PLANNER_MODEL` | `anthropic/claude-sonnet-4-5` | 7-day plan generation |
| `MEAL_PLANNER_FALLBACK_MODEL` | _(empty)_ | |
| `COACH_MODEL` | `gemini/gemini-2.5-flash` | Conversational coaching (Phase 2) |
| `INSIGHT_NARRATOR_MODEL` | `anthropic/claude-sonnet-4-5` | Alert → insight headline (Phase 2) |

**Prefix rules:**

```
anthropic/<model-id>   →  Anthropic API  (needs ANTHROPIC_API_KEY)
gemini/<model-id>      →  Google Gemini  (needs GEMINI_API_KEY)
local/<model-id>       →  LOCAL_AI_API_BASE  (Ollama, LM Studio, etc.)
```

**Example — fully local stack with Ollama:**

```bash
LOCAL_AI_API_BASE=http://host.docker.internal:11434
FOOD_EXTRACTOR_MODEL=local/gemma-4-e4b-it
MEAL_PLANNER_MODEL=local/llama3.1:8b-instruct
COACH_MODEL=local/llama3.1:8b-instruct
INSIGHT_NARRATOR_MODEL=local/llama3.1:8b-instruct
```

**Example — local food extraction, cloud meal planning:**

```bash
LOCAL_AI_API_BASE=http://host.docker.internal:11434
FOOD_EXTRACTOR_MODEL=local/gemma-4-e4b-it
FOOD_EXTRACTOR_FALLBACK_MODEL=gemini/gemini-2.5-flash
MEAL_PLANNER_MODEL=anthropic/claude-sonnet-4-5
```

### Whisper STT

| Variable | Default | Description |
|---|---|---|
| `WHISPER_URL` | `http://whisper:9000` | Internal endpoint — do not change unless moving the service |
| `WHISPER_MODEL` | `base.en` | Model size. `base.en` is baked into the image. Other sizes download on first start and cache in the `whisper_model_cache` volume. |

Available sizes (accuracy / VRAM tradeoff): `tiny.en` · `base.en` · `small.en` · `medium.en` · `large-v3`

### Food Database

| Variable | Description |
|---|---|
| `USDA_API_KEY` | Optional. Free key from [fdc.nal.usda.gov](https://fdc.nal.usda.gov/api-key-signup). Enables live USDA FoodData Central fallback when local food search returns fewer than 5 results. |

### App

| Variable | Default | Description |
|---|---|---|
| `ENVIRONMENT` | `development` | Set to `production` to enable stricter error handling and disable debug routes |
| `CORS_ORIGINS` | `http://localhost:5173,https://localhost` | Comma-separated list of allowed origins |
| `VITE_USE_MOCK_DATA` | `1` | `1` = mock API responses; `0` = live backend |

---

## HAE Webhook

The `/api/v1/ingest/hae` endpoint accepts biometric readings from any device or app that can send signed HTTP requests.

### Request format

```http
POST https://<your-domain>/api/v1/ingest/hae
Content-Type: application/json
X-Luma-Signature: hmac-sha256=<hex-digest>

{
  "metric":      "weight_kg",
  "value":       82.4,
  "recorded_at": "2026-05-26T08:14:00Z",
  "source":      "withings"
}
```

### Signature

The `X-Luma-Signature` header is `hmac-sha256=` followed by the lowercase hex digest of `HMAC-SHA256(HAE_SHARED_SECRET, request-body-bytes)`.

**Python example:**

```python
import hmac, hashlib, json

secret = b"your_hae_shared_secret"
body   = json.dumps({"metric": "weight_kg", "value": 82.4, "recorded_at": "2026-05-26T08:14:00Z"}).encode()
sig    = "hmac-sha256=" + hmac.new(secret, body, hashlib.sha256).hexdigest()
```

### Supported metric types

| `metric` | Unit | Description |
|---|---|---|
| `weight_kg` | kg | Body mass |
| `body_fat_pct` | % | Body fat percentage |
| `systolic_bp` | mmHg | Systolic blood pressure |
| `diastolic_bp` | mmHg | Diastolic blood pressure |
| `heart_rate` | bpm | Resting heart rate |
| `hrv_ms` | ms | Heart rate variability (RMSSD) |
| `spo2_pct` | % | Blood oxygen saturation |
| `glucose_mmol` | mmol/L | Blood glucose |
| `steps` | count | Daily step count |

---

## TLS Configuration

### Development (default)

`make setup` generates a self-signed certificate via `setup_dev.sh`. Nginx stores it in the `nginx_certs` Docker volume. Browsers will show an "untrusted certificate" warning — this is expected.

### Production — bring your own certificate

Copy your certificate files into the `nginx_certs` volume before starting:

```bash
# Get the volume mount path
docker volume inspect luma_nginx_certs

# Copy files (adjust path to match volume mountpoint)
sudo cp fullchain.pem /var/lib/docker/volumes/luma_nginx_certs/_data/
sudo cp privkey.pem   /var/lib/docker/volumes/luma_nginx_certs/_data/
```

Then restart Nginx:

```bash
docker compose restart frontend
```

---

## Proxy Mode

Set `LUMA_PROXY_MODE=true` when Luma sits behind an upstream reverse proxy (Nginx, Caddy, Traefik, Cloudflare Tunnel) that handles TLS termination.

In proxy mode:
- Luma's Nginx serves plain HTTP on `LUMA_HTTP_PORT` (default 80, set to something like 8080 to avoid conflict)
- Your upstream proxy forwards to `http://127.0.0.1:<LUMA_HTTP_PORT>`
- Set `X-Forwarded-Proto`, `X-Forwarded-For`, and `Host` headers in your upstream proxy config

**Example `.env` for proxy mode:**

```bash
LUMA_PROXY_MODE=true
LUMA_HTTP_PORT=8080
LUMA_DOMAIN=luma.example.com
```

**Nginx upstream example:**

```nginx
location / {
    proxy_pass         http://127.0.0.1:8080;
    proxy_set_header   X-Forwarded-Proto $scheme;
    proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header   Host              $host;
}
```
