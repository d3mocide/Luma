from sovereign_health.config import settings
from sovereign_health.worker.tasks import ingest_hae_task, run_alerts


class WorkerSettings:
    redis_settings = settings.redis_url
    functions = [ingest_hae_task, run_alerts]
    queue_name = "sovereign_health"
    max_jobs = 10
    job_timeout = 300
