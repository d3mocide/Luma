from arq.connections import RedisSettings
from luma.config import settings
from luma.worker.tasks import ingest_hae_task, run_alerts


class WorkerSettings:
    redis_settings = RedisSettings.from_dsn(settings.redis_url)
    functions = [ingest_hae_task, run_alerts]
    queue_name = "luma"
    max_jobs = 10
    job_timeout = 300
