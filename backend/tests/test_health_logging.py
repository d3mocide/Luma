"""Tests for medication and supplement daily intake logging endpoints."""
import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

from fastapi import FastAPI
from fastapi.testclient import TestClient

from luma.api.health import router
from luma.db.models import Medication, MedicationLog, Supplement, SupplementLog
from luma.deps import get_current_user, get_db


def _make_fake_user():
    user = MagicMock()
    user.id = uuid.uuid4()
    return user

def _make_fake_med(user_id):
    med = MagicMock(spec=Medication)
    med.id = uuid.uuid4()
    med.user_id = user_id
    med.name = "Lipitor"
    med.generic_name = "Atorvastatin"
    med.dose = "10mg"
    med.frequency = "Once daily"
    med.notes = "Take before bed"
    med.is_active = True
    med.created_at = datetime.now(UTC)
    return med

def _make_fake_supp(user_id):
    supp = MagicMock(spec=Supplement)
    supp.id = uuid.uuid4()
    supp.user_id = user_id
    supp.name = "Omega-3 Fish Oil"
    supp.dose = "1000mg"
    supp.frequency = "Twice daily"
    supp.nutrients_per_dose = {"epa_mg": 180, "dha_mg": 120}
    supp.is_active = True
    supp.created_at = datetime.now(UTC)
    return supp

def _make_app(fake_user, db_override):
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_db] = db_override
    app.dependency_overrides[get_current_user] = lambda: fake_user
    return app

def test_medication_logging_cycle():
    user = _make_fake_user()
    med = _make_fake_med(user.id)

    db = AsyncMock()
    db.add = MagicMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    
    # 1. Mock DB for checking if medication exists
    result_med = MagicMock()
    result_med.scalar_one_or_none.return_value = med

    # Mock DB for checking if log exists (first check: doesn't exist)
    result_log_empty = MagicMock()
    result_log_empty.scalar_one_or_none.return_value = None

    # We mock execute to return different things in sequence
    db.execute = AsyncMock(side_effect=[result_med, result_log_empty])

    app = _make_app(user, lambda: db)

    with TestClient(app) as client:
        # POST to log it
        resp = client.post(f"/health/medications/{med.id}/log")
        assert resp.status_code == 201
        assert resp.json()["status"] == "logged"

        # Verify added to DB
        assert db.add.called
        log_instance = db.add.call_args[0][0]
        assert isinstance(log_instance, MedicationLog)
        assert log_instance.user_id == user.id
        assert log_instance.medication_id == med.id


def test_medication_unlogging():
    user = _make_fake_user()
    med = _make_fake_med(user.id)
    log = MedicationLog(id=uuid.uuid4(), user_id=user.id, medication_id=med.id)

    db = AsyncMock()
    db.delete = AsyncMock()
    db.commit = AsyncMock()

    result_logs = MagicMock()
    result_logs.scalars.return_value.all.return_value = [log]
    db.execute = AsyncMock(return_value=result_logs)

    app = _make_app(user, lambda: db)

    with TestClient(app) as client:
        resp = client.delete(f"/health/medications/{med.id}/log")
        assert resp.status_code == 204
        assert db.delete.called
        assert db.commit.called


def test_supplement_logging_cycle():
    user = _make_fake_user()
    supp = _make_fake_supp(user.id)

    db = AsyncMock()
    db.add = MagicMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()

    result_supp = MagicMock()
    result_supp.scalar_one_or_none.return_value = supp

    result_log_empty = MagicMock()
    result_log_empty.scalar_one_or_none.return_value = None

    db.execute = AsyncMock(side_effect=[result_supp, result_log_empty])

    app = _make_app(user, lambda: db)

    with TestClient(app) as client:
        resp = client.post(f"/health/supplements/{supp.id}/log")
        assert resp.status_code == 201
        assert resp.json()["status"] == "logged"

        assert db.add.called
        log_instance = db.add.call_args[0][0]
        assert isinstance(log_instance, SupplementLog)
        assert log_instance.user_id == user.id
        assert log_instance.supplement_id == supp.id
