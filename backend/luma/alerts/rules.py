"""Alert rule definitions — Phase 2."""
from typing import NamedTuple


class AlertResult(NamedTuple):
    rule_id: str
    severity: str
    payload: dict


async def check_weight_trend(user_id: str, db) -> AlertResult | None:
    raise NotImplementedError("Phase 2")


async def check_sat_fat_rolling(user_id: str, db) -> AlertResult | None:
    raise NotImplementedError("Phase 2")


async def check_soluble_fiber_rolling(user_id: str, db) -> AlertResult | None:
    raise NotImplementedError("Phase 2")


async def check_logging_gap(user_id: str, db) -> AlertResult | None:
    raise NotImplementedError("Phase 2")


async def check_hrv_anomaly(user_id: str, db) -> AlertResult | None:
    raise NotImplementedError("Phase 2")
