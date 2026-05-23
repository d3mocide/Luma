from lumo.config import settings
from lumo.worker.tasks import ingest_hae_task, run_alerts


class WorkerSettings:
    redis_settings = settings.redis_url
    functions = [ingest_hae_task, run_alerts]
    queue_name = "lumo"
    max_jobs = 10
    job_timeout = 300
