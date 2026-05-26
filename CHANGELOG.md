# Changelog — Luma

All notable changes to the Luma project will be documented in this file. This project adheres to a strict phase-gated development model.

---

## [Phase 0 — Foundations] — 2026-05-26

Phase 0 establishes the core multi-container Docker stack, secure self-hosted authentication, the automated data ingestion pipeline, telemetry reporting backend, initial React frontend PWA shell, and local developer environment bootstrapping.

### Added
- **Multi-Container Stack:** Formulated `compose.yml` orchestrating FastAPI API service, ARQ background worker, TimescaleDB, Redis, LiteLLM proxy, Whisper STT, and Nginx.
- **SSL Development Setup Script (`setup_dev.sh`):** Created a host-level initialization utility that checks dependencies, configures secure environment variables automatically, generates local self-signed SSL certificates, and starts the containerized stack.
- **Dynamic First-Run Setup Wizard:** Created secure backend routes and matching React components. If the database is empty, Luma now boots directly into an interactive setup wizard in the browser to register the primary Operator account, completely locking the setup route once the first user is added.
- **HMAC Telemetry Ingest (`POST /api/v1/ingest/hae`):** Built robust signature validation and ingestion handler supporting all 9 Health Auto Export metric types, storing incoming telemetry inside the TimescaleDB biometrics hypertable.
- **API Status Dashboard and Trends (`/api/v1/today` & `/api/v1/trends/{metric}`):** Implemented continuous aggregation querying logic over TimescaleDB to calculate weight slopes and supply analytics per biometric type over customizable intervals.
- **Glassmorphic Login System:** Developed custom React components for standard credentials auth with Argon2id + secure HTTP-only cookies, error handlers, and visual overlays.
- **System Verification Suite (`verify_api.py`):** Created an automated end-to-end telemetry and auth route testing suite to confirm stack integrity.

### Fixed
- **API Container Module Entrypoint:** Corrected the Uvicorn starting entrypoint inside `backend/Dockerfile` to point to `luma.main:app`.
- **Database URL Mapping:** Re-aligned default database name references to target `/luma` inside the TimescaleDB container initialization blocks.
- **Pydantic CORS Handling:** Refactored `cors_origins` parsing and validation rules inside `config.py` to seamlessly process standard comma-separated lists.
- **SQL Interval Parameter Type Coercion:** Refactored raw SQL string concatenation in `today.py` and `trends.py` to leverage native Postgres integer-to-interval multiplication (`* INTERVAL '1 day'`), completely resolving `asyncpg` type mismatches.
- **Pydantic Model Schema Parity:** Standardized UUID serialization inside auth API responses by adjusting Pydantic property types to match raw SQLAlchemy objects natively.
- **Alembic Autogenerate Parity:** Updated `env.py` to filter and ignore raw SQL TimescaleDB hypertables, custom continuous aggregates, and composite indexes, ensuring a clean `alembic check` status.
