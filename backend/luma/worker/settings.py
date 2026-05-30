from arq.connections import RedisSettings
from arq.cron import cron

from luma.config import settings
from luma.worker.tasks import ingest_hae_task, run_alerts, refresh_all_coach_contexts


class WorkerSettings:
    redis_settings = RedisSettings.from_dsn(settings.redis_url)
    functions = [ingest_hae_task, run_alerts, refresh_all_coach_contexts]
    cron_jobs = [
        cron(run_alerts, minute={0, 30}),
        cron(refresh_all_coach_contexts, hour={0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22}, minute=5),
    ]
    queue_name = "luma"
    max_jobs = 10
    job_timeout = 300
