from arq.connections import RedisSettings
from arq.cron import cron

from luma.config import settings
from luma.worker.tasks import (
    ingest_hae_task,
    run_alerts,
    refresh_all_coach_contexts,
    update_case_file_task,
    update_all_case_files,
)


class WorkerSettings:
    redis_settings = RedisSettings.from_dsn(settings.redis_url)
    functions = [ingest_hae_task, run_alerts, refresh_all_coach_contexts, update_case_file_task, update_all_case_files]
    cron_jobs = [
        cron(run_alerts, minute={0, 30}),
        cron(refresh_all_coach_contexts, hour={0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22}, minute=5),
        cron(update_all_case_files, hour={1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23}, minute=5),
    ]
    queue_name = "luma"
    max_jobs = 10
    job_timeout = 300
