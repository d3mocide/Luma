import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from luma.config import settings
from luma.api import auth, ingest, today, trends, log, plan, coach, foods, recipes, goals, insights, hae_diagnostic, admin

logging.basicConfig(
    level=logging.INFO if settings.is_production else logging.DEBUG,
    format="%(asctime)s %(name)s %(levelname)s %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Luma API starting (env=%s)", settings.environment)
    yield
    logger.info("Luma API shutting down")


app = FastAPI(
    title="Luma API",
    version="0.1.0",
    docs_url=None if settings.is_production else "/docs",
    redoc_url=None,
    lifespan=lifespan,
)

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
app.include_router(goals.router, prefix=API_PREFIX, tags=["goals"])
app.include_router(insights.router, prefix=f"{API_PREFIX}/insights", tags=["insights"])
app.include_router(hae_diagnostic.router, prefix=API_PREFIX, tags=["hae-diagnostic"])
app.include_router(admin.router, prefix=f"{API_PREFIX}/admin", tags=["admin"])


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}
