"""ML-based alert rules — Prophet weight forecasting and IsolationForest biometric outlier detection."""
from __future__ import annotations

import logging
from collections import defaultdict

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from luma.alerts.rules import AlertResult

logger = logging.getLogger(__name__)

_MIN_WEIGHT_POINTS = 21   # 3 weeks minimum for a meaningful Prophet fit
_MIN_ISO_POINTS = 14      # 2 weeks minimum for IsolationForest


async def check_weight_forecast_anomaly(user_id: str, db: AsyncSession) -> AlertResult | None:
    """Prophet-based weight trend: alert when the 14-day forecast diverges from the goal direction."""
    try:
        import pandas as pd
        from prophet import Prophet
    except ImportError:
        logger.warning("prophet not installed; skipping weight forecast rule for user %s", user_id)
        return None

    goal_row = await db.execute(
        text("SELECT target_weight_kg::float AS target FROM goals WHERE user_id = :uid"),
        {"uid": user_id},
    )
    goal = goal_row.fetchone()
    if not goal or goal.target is None:
        return None

    weight_rows = await db.execute(
        text("""
            SELECT day AS ds, last_value AS y
            FROM biometrics_daily
            WHERE user_id = :uid AND metric = 'weight_kg'
              AND day >= now() - INTERVAL '90 days'
            ORDER BY day
        """),
        {"uid": user_id},
    )
    rows = weight_rows.fetchall()
    if len(rows) < _MIN_WEIGHT_POINTS:
        return None

    df = pd.DataFrame([{"ds": r.ds, "y": float(r.y)} for r in rows])

    try:
        m = Prophet(
            daily_seasonality=False,
            weekly_seasonality=False,
            yearly_seasonality=False,
            changepoint_prior_scale=0.05,
        )
        m.fit(df)
        future = m.make_future_dataframe(periods=14)
        forecast = m.predict(future)
    except Exception:
        logger.exception("Prophet fit/predict failed for user %s", user_id)
        return None

    current = float(df["y"].iloc[-1])
    forecast_14d = float(forecast["yhat"].iloc[-1])
    target = goal.target

    # Fire if the forecast moves in the wrong direction by more than 0.5 kg
    losing = target < current
    gaining = target > current
    wrong_direction = (losing and forecast_14d > current + 0.5) or (gaining and forecast_14d < current - 0.5)

    if not wrong_direction:
        return None

    return AlertResult(
        rule_id="weight_forecast_diverging",
        severity="warning",
        payload={
            "current_weight_kg": round(current, 1),
            "target_weight_kg": round(target, 1),
            "forecast_14d_kg": round(forecast_14d, 1),
        },
        dedup_hours=168,
    )


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
