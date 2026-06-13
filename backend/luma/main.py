import asyncio
import logging
import re
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from luma.api import (
    admin,
    auth,
    coach,
    family,
    favorites,
    foods,
    goals,
    hae_diagnostic,
    health,
    ingest,
    insights,
    journal,
    log,
    notifications,
    plan,
    recipes,
    today,
    trends,
    water,
)
from luma.config import settings
from luma.middleware import CSRFMiddleware

logging.basicConfig(
    level=logging.INFO if settings.is_production else logging.DEBUG,
    format="%(asctime)s %(name)s %(levelname)s %(message)s",
)

# SQLAlchemy logs every query+params at INFO by default — too noisy
logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)

class _HealthCheckFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        return "GET /health" not in record.getMessage()


# The ingest paths embed a long-lived per-user credential; it must never land
# in access logs (nginx already skips ingest paths — this covers uvicorn).
_INGEST_TOKEN_RE = re.compile(r"(/api/v1/ingest/(?:hae|health-connect)/)[^\s?\"]+")


class _IngestTokenRedactFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        if record.args:
            record.args = tuple(
                _INGEST_TOKEN_RE.sub(r"\1[redacted]", arg) if isinstance(arg, str) else arg
                for arg in record.args
            )
        return True


logging.getLogger("uvicorn.access").addFilter(_HealthCheckFilter())
logging.getLogger("uvicorn.access").addFilter(_IngestTokenRedactFilter())

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Luma API starting (env=%s)", settings.environment)

    if settings.is_production and not settings.hae_shared_secret:
        logger.warning(
            "HAE_SHARED_SECRET is empty — ingest endpoints will accept any request "
            "that presents a valid per-user import token, with no app-level secret."
        )

    # Apply any pending Alembic migrations before accepting traffic so that
    # new deployments are never stuck waiting for a manual `make migrate`.
    def _run_alembic():
        from alembic.config import Config

        from alembic import command
        cfg = Config("alembic.ini")
        command.upgrade(cfg, "head")

    try:
        await asyncio.get_running_loop().run_in_executor(None, _run_alembic)
        logger.info("Database schema is up to date")
    except Exception as exc:
        logger.error("Database migration failed — aborting startup: %s", exc)
        raise

    # Automatically seed the clinical core USDA Reference dataset on first startup if the database is empty
    from sqlalchemy import func, select

    from luma.db.models import Food
    from luma.db.session import AsyncSessionLocal
    
    async with AsyncSessionLocal() as session:
        try:
            count_res = await session.execute(select(func.count(Food.id)))
            count = count_res.scalar()
            if count == 0:
                logger.info("Database contains 0 foods. Automatically seeding clinical core USDA Reference dataset...")
                from luma.scripts.ingest_usda import main as seed_usda_reference
                await seed_usda_reference()
                logger.info("Clinical core USDA Reference dataset successfully seeded.")
        except Exception as exc:
            logger.info("Reference database seeding check skipped (expected if migrations have not run yet: %s)", exc)

    yield
    logger.info("Luma API shutting down")


app = FastAPI(
    title="Luma API",
    version="0.1.0",
    docs_url=None if settings.is_production else "/docs",
    redoc_url=None,
    lifespan=lifespan,
)

app.add_middleware(CSRFMiddleware, secure=settings.is_production)

# Added after CSRF so CORS runs outermost and preflights never hit the CSRF check.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

API_PREFIX = "/api/v1"

app.include_router(auth.router, prefix=f"{API_PREFIX}/auth", tags=["auth"])
app.include_router(ingest.router, prefix=f"{API_PREFIX}/ingest", tags=["ingest"])
app.include_router(today.router, prefix=API_PREFIX, tags=["today"])
app.include_router(trends.router, prefix=f"{API_PREFIX}/trends", tags=["trends"])
app.include_router(log.router, prefix=f"{API_PREFIX}/log", tags=["log"])
app.include_router(plan.router, prefix=f"{API_PREFIX}/plan", tags=["plan"])
app.include_router(coach.router, prefix=f"{API_PREFIX}/coach", tags=["coach"])
app.include_router(foods.router, prefix=f"{API_PREFIX}/foods", tags=["foods"])
app.include_router(recipes.router, prefix=f"{API_PREFIX}/recipes", tags=["recipes"])
app.include_router(favorites.router, prefix=f"{API_PREFIX}/favorites", tags=["favorites"])
app.include_router(goals.router, prefix=API_PREFIX, tags=["goals"])
app.include_router(insights.router, prefix=f"{API_PREFIX}/insights", tags=["insights"])
app.include_router(hae_diagnostic.router, prefix=API_PREFIX, tags=["hae-diagnostic"])
app.include_router(admin.router, prefix=f"{API_PREFIX}/admin", tags=["admin"])
app.include_router(journal.router, prefix=f"{API_PREFIX}/journal", tags=["journal"])
app.include_router(notifications.router, prefix=f"{API_PREFIX}/notifications", tags=["notifications"])
app.include_router(family.router, prefix=f"{API_PREFIX}/family", tags=["family"])
app.include_router(health.router, prefix=API_PREFIX, tags=["health"])
app.include_router(water.router, prefix=f"{API_PREFIX}/water", tags=["water"])


@app.get("/health")
async def healthz() -> dict:
    return {"status": "ok"}
