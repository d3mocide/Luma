"""Alert rules, engine, and narration tests."""
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from luma.agents.insight_narrator import _parse_insight, narrate_alert
from luma.alerts.engine import _narrate_pending, _process_user, run_alert_engine
from luma.alerts.rules import AlertResult, check_soluble_fiber_rolling

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

    # _resolve_cleared_alerts: no open alerts to sweep
    mock_open_result = MagicMock()
    mock_open_result.fetchall.return_value = []

    db.execute.side_effect = [
        mock_recent_result,  # SELECT recent alerts (dedup window)
        AsyncMock(),         # INSERT alert
        mock_open_result,    # SELECT open alerts in _resolve_cleared_alerts
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
    alert.ts = datetime.now(UTC)

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


# ── Insight Narrator Parsing ────────────────────────────────────────────────────


def _llm_response(content: str) -> dict:
    return {"choices": [{"message": {"content": content}}]}


def test_parse_insight_accepts_clean_object():
    parsed = _parse_insight(
        '{"headline": "Watch Saturated Fat", "body": "Intake was high.", "thread_seed": "How do I cut it?"}'
    )
    assert parsed == {
        "headline": "Watch Saturated Fat",
        "body": "Intake was high.",
        "thread_seed": "How do I cut it?",
    }


def test_parse_insight_strips_code_fences_and_prose():
    parsed = _parse_insight(
        'Here you go:\n```json\n{"headline": "Hi", "body": "There.", "thread_seed": "Why?"}\n```'
    )
    assert parsed is not None
    assert parsed["headline"] == "Hi"


def test_parse_insight_strips_reasoning_block():
    """The local narrator runs with reasoning enabled and prefills a <think> block."""
    raw = (
        "<think>The user broke a 3-day streak. Keep it warm and encouraging, "
        "not alarming.</think>\n"
        '{"body": "It\'s okay to miss a day! Consistency, not perfection, is key.", '
        '"headline": "Restarting Your Logging Streak Is Easy", '
        '"thread_seed": "What\'s the easiest way to get back into logging?"}'
    )
    parsed = _parse_insight(raw)
    assert parsed is not None
    assert parsed["headline"] == "Restarting Your Logging Streak Is Easy"
    assert parsed["body"].startswith("It's okay to miss a day")


def test_parse_insight_strips_dangling_reasoning_close_tag():
    raw = 'reasoning the model emitted</think>\n{"headline": "H", "body": "B", "thread_seed": "S"}'
    parsed = _parse_insight(raw)
    assert parsed is not None
    assert parsed["headline"] == "H"


@pytest.mark.parametrize("tag", ["think", "thinking", "reasoning", "THINK"])
def test_parse_insight_strips_reasoning_tag_variants(tag):
    raw = f'<{tag}>some reasoning</{tag}>{{"headline": "H", "body": "B", "thread_seed": "S"}}'
    parsed = _parse_insight(raw)
    assert parsed is not None
    assert parsed["headline"] == "H"


def test_parse_insight_handles_braces_in_reasoning():
    raw = (
        '<think>Data was {"days": 1}, so be gentle.</think>'
        '{"headline": "H", "body": "B", "thread_seed": "S"}'
    )
    parsed = _parse_insight(raw)
    assert parsed is not None
    assert parsed["body"] == "B"


def test_parse_insight_rejects_schema_echo():
    """A local model handed json_schema sometimes echoes the schema itself.

    That is valid JSON but lacks the required keys, so it must be rejected rather
    than surfacing as the 'New insight' default with an empty body.
    """
    schema_echo = '{"properties": {"headline": {"type": "string"}}, "type": "object"}'
    assert _parse_insight(schema_echo) is None


def test_parse_insight_rejects_missing_keys_and_invalid_json():
    assert _parse_insight('{"headline": "only headline"}') is None
    assert _parse_insight("not json at all") is None
    assert _parse_insight("") is None


@pytest.mark.asyncio
async def test_narrate_alert_returns_parsed_insight():
    good = _llm_response(
        '{"headline": "Watch Saturated Fat", "body": "Trending up this week.", "thread_seed": "How do I cut it?"}'
    )
    with patch("luma.agents.insight_narrator.call_llm", new_callable=AsyncMock, return_value=good) as mock_llm:
        result = await narrate_alert("a1", "sat_fat_rolling", "warning", {"avg_7d_g": 22.0})

    assert result["headline"] == "Watch Saturated Fat"
    assert result["body"] == "Trending up this week."
    mock_llm.assert_awaited_once()


@pytest.mark.asyncio
async def test_narrate_alert_recovers_via_correction_retry():
    """First call echoes the schema; the correction retry returns a valid object."""
    schema_echo = _llm_response('{"properties": {"headline": {"type": "string"}}}')
    good = _llm_response(
        '{"headline": "Fiber Low", "body": "Aim for more soluble fiber.", "thread_seed": "Best fiber foods?"}'
    )
    with patch(
        "luma.agents.insight_narrator.call_llm",
        new_callable=AsyncMock,
        side_effect=[schema_echo, good],
    ) as mock_llm:
        result = await narrate_alert("a2", "low_fiber_rolling", "info", {})

    assert result["headline"] == "Fiber Low"
    assert result["body"] == "Aim for more soluble fiber."
    assert mock_llm.await_count == 2


@pytest.mark.asyncio
async def test_narrate_alert_falls_back_when_retry_also_fails():
    bad = _llm_response('{"properties": {}}')
    with patch(
        "luma.agents.insight_narrator.call_llm",
        new_callable=AsyncMock,
        side_effect=[bad, bad],
    ):
        result = await narrate_alert("a3", "hrv_drop", "warning", {})

    assert result == {
        "headline": "Heart Rate Variability Drop",
        "body": "Luma detected a noticeable drop in your HRV compared to your recent baseline.",
        "thread_seed": "What factors could be causing my HRV to drop?",
    }
