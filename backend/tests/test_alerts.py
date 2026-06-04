"""Alert rules, engine, and narration tests."""
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from luma.alerts.rules import AlertResult, check_soluble_fiber_rolling
from luma.alerts.engine import run_alert_engine, _process_user, _narrate_pending


# ── Alert Rules ───────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_check_soluble_fiber_rolling_fires_on_low_intake():
    """Fires a warning when soluble fiber is below 70% of target."""
    user_id = str(uuid4())
    db = AsyncMock()

    # Mock database row return value: target=10g, avg_fiber=5g (50%)
    mock_row = MagicMock()
    mock_row.target = 10.0
    mock_row.avg_fiber = 5.0
    
    mock_result = MagicMock()
    mock_result.fetchone.return_value = mock_row
    db.execute.return_value = mock_result

    result = await check_soluble_fiber_rolling(user_id, db)

    assert result is not None
    assert result.rule_id == "low_fiber_rolling"
    assert result.severity == "warning"
    assert result.payload == {"avg_7d_g": 5.0, "target_g": 10.0}


@pytest.mark.asyncio
async def test_check_soluble_fiber_rolling_does_not_fire_on_adequate_intake():
    """Does not fire when soluble fiber is >= 70% of target."""
    user_id = str(uuid4())
    db = AsyncMock()

    # Mock database row: target=10g, avg_fiber=8g (80%)
    mock_row = MagicMock()
    mock_row.target = 10.0
    mock_row.avg_fiber = 8.0
    
    mock_result = MagicMock()
    mock_result.fetchone.return_value = mock_row
    db.execute.return_value = mock_result

    result = await check_soluble_fiber_rolling(user_id, db)

    assert result is None


@pytest.mark.asyncio
async def test_check_soluble_fiber_rolling_returns_none_when_no_data():
    """Returns None gracefully when goals or log data are missing."""
    user_id = str(uuid4())
    db = AsyncMock()

    mock_result = MagicMock()
    mock_result.fetchone.return_value = None
    db.execute.return_value = mock_result

    result = await check_soluble_fiber_rolling(user_id, db)

    assert result is None


# ── Alert Engine ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_run_alert_engine_runs_for_users():
    """Verify that run_alert_engine executes process_user for each user in the DB."""
    db = AsyncMock()
    
    user1 = MagicMock()
    user1.id = uuid4()
    user2 = MagicMock()
    user2.id = uuid4()

    mock_result = MagicMock()
    mock_result.fetchall.return_value = [user1, user2]
    # To support list comprehension or iteration directly on result
    mock_result.__iter__.return_value = [user1, user2]
    db.execute.return_value = mock_result

    # Mock AsyncSessionLocal to yield our mock db
    async def mock_session():
        yield db

    with patch("luma.alerts.engine.AsyncSessionLocal", return_value=db), \
         patch("luma.alerts.engine._process_user", new_callable=AsyncMock) as mock_process:
        # Simulate standard __aenter__ / __aexit__ for context manager
        db.__aenter__.return_value = db
        await run_alert_engine()
        
        assert mock_process.call_count == 2
        mock_process.assert_any_call(str(user1.id))
        mock_process.assert_any_call(str(user2.id))


@pytest.mark.asyncio
async def test_process_user_inserts_alert_and_calls_narrator():
    """Verify that process_user queries recent rules, fires alerts, and calls narration."""
    user_id = str(uuid4())
    db = AsyncMock()
    db.__aenter__.return_value = db

    # Recent rules query (none fired in last 24h)
    mock_recent_result = MagicMock()
    mock_recent_result.__iter__.return_value = []
    
    db.execute.side_effect = [
        mock_recent_result,  # first select query in _process_user (recent alerts)
        AsyncMock(),         # insert statement
    ]

    # Mock rule to fire a dummy alert
    dummy_rule = AsyncMock(return_value=AlertResult(
        rule_id="sat_fat_rolling",
        severity="warning",
        payload={"avg_7d_g": 22.0, "target_g": 18.0}
    ))

    with patch("luma.alerts.engine.ALL_RULES", [dummy_rule]), \
         patch("luma.alerts.engine.AsyncSessionLocal", return_value=db), \
         patch("luma.alerts.engine._narrate_pending", new_callable=AsyncMock) as mock_narrate:
         
        await _process_user(user_id)
        
        dummy_rule.assert_called_once_with(user_id, db)
        
        # Verify db.execute was called to insert the alert
        insert_call = db.execute.call_args_list[1]
        sql_string = str(insert_call[0][0].text)
        assert "INSERT INTO alerts" in sql_string
        assert "CAST(:payload AS JSONB)" in sql_string
        
        params = insert_call[0][1]
        assert params["uid"] == user_id
        assert params["rule_id"] == "sat_fat_rolling"
        assert params["severity"] == "warning"
        
        # Verify db.commit and narration call
        db.commit.assert_called()
        mock_narrate.assert_called_once_with(user_id, db)


# ── Alert Narration ───────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_narrate_pending_processes_and_saves_narrative():
    """Verify that _narrate_pending fetches pending alerts, calls narrate_alert, and updates rows."""
    user_id = str(uuid4())
    db = AsyncMock()

    alert = MagicMock()
    alert.id = uuid4()
    alert.rule_id = "sat_fat_rolling"
    alert.severity = "warning"
    alert.payload = {"avg_7d_g": 22.0}
    alert.ts = datetime.now(timezone.utc)

    mock_pending_result = MagicMock()
    mock_pending_result.fetchall.return_value = [alert]
    db.execute.side_effect = [
        mock_pending_result,  # pending fetch query
        AsyncMock(),          # update query
    ]

    fake_narrative = {
        "headline": "Watch Saturated Fat",
        "body": "Saturated fat intake was higher this week.",
        "thread_seed": "How can I reduce saturated fat?"
    }

    with patch("luma.agents.insight_narrator.narrate_alert", new_callable=AsyncMock, return_value=fake_narrative) as mock_narrate_alert:
        await _narrate_pending(user_id, db)
        
        mock_narrate_alert.assert_called_once_with(
            alert_id=str(alert.id),
            rule_id=alert.rule_id,
            severity=alert.severity,
            payload=alert.payload
        )
        
        # Verify update statement was executed
        update_call = db.execute.call_args_list[1]
        sql_string = str(update_call[0][0].text)
        assert "UPDATE alerts SET narrative = :narrative" in sql_string
        
        params = update_call[0][1]
        assert "Watch Saturated Fat" in params["narrative"]
        assert params["uid"] == user_id
        assert params["id"] == str(alert.id)
        assert params["ts"] == alert.ts
        
        db.commit.assert_called_once()
