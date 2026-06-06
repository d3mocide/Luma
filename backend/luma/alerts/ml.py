"""ML-based alert rules — IsolationForest multi-variate biometric outlier detection."""
from __future__ import annotations

import logging
from collections import defaultdict

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from luma.alerts.rules import AlertResult

logger = logging.getLogger(__name__)

_MIN_ISO_POINTS = 14  # 2 weeks minimum for IsolationForest


async def check_biometric_isolation_forest(user_id: str, db: AsyncSession) -> AlertResult | None:
    """IsolationForest: fire when ≥3 of the last 7 days form a multi-variate biometric outlier cluster."""
    try:
        import numpy as np
        from sklearn.ensemble import IsolationForest
    except ImportError:
        logger.warning("scikit-learn not installed; skipping IsolationForest rule for user %s", user_id)
        return None

    tracked_metrics = ["hrv_ms", "rhr_bpm", "sleep_score"]

    rows_result = await db.execute(
        text("""
            SELECT day, metric, avg_value
            FROM biometrics_daily
            WHERE user_id = :uid
              AND metric = ANY(:metrics)
              AND day >= now() - INTERVAL '45 days'
            ORDER BY day, metric
        """),
        {"uid": user_id, "metrics": tracked_metrics},
    )
    rows = rows_result.fetchall()
    if not rows:
        return None

    daily: dict[str, dict] = defaultdict(dict)
    for r in rows:
        daily[str(r.day)][r.metric] = float(r.avg_value)

    days_sorted = sorted(daily.keys())
    complete = [d for d in days_sorted if all(m in daily[d] for m in tracked_metrics)]
    if len(complete) < _MIN_ISO_POINTS:
        return None

    X = np.array([[daily[d][m] for m in tracked_metrics] for d in complete])
    clf = IsolationForest(n_estimators=100, contamination=0.1, random_state=42)
    clf.fit(X)

    recent = complete[-7:]
    X_recent = np.array([[daily[d][m] for m in tracked_metrics] for d in recent])
    preds = clf.predict(X_recent)  # -1 = outlier, 1 = normal

    outlier_days = [recent[i] for i, p in enumerate(preds) if p == -1]
    if len(outlier_days) < 3:
        return None

    last_vals = {m: round(daily[outlier_days[-1]][m], 1) for m in tracked_metrics}

    return AlertResult(
        rule_id="biometric_cluster_anomaly",
        severity="warning",
        payload={
            "anomalous_days": len(outlier_days),
            "latest_anomaly_day": outlier_days[-1],
            "biometrics": last_vals,
        },
        dedup_hours=168,
    )
