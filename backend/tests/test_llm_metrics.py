from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from luma.services.llm_metrics import LLMMetricsTracker


@pytest.mark.asyncio
async def test_llm_metrics_record_success_increments_tokens():
    tracker = LLMMetricsTracker()
    mock_redis = MagicMock()
    mock_pipe = MagicMock()
    mock_pipe.execute = AsyncMock()
    mock_redis.pipeline.return_value = mock_pipe
    
    with patch.object(tracker, "_client", return_value=mock_redis):
        await tracker.record_event(
            event="success",
            model="gemini/gemini-1.5-flash",
            provider="gemini",
            attempt="primary",
            prompt_tokens=100,
            completion_tokens=50,
            total_tokens=150,
        )
        
        # Verify global and model-specific tokens are incremented
        mock_pipe.hincrby.assert_any_call("luma:llm_metrics:totals", "prompt_tokens", 100)
        mock_pipe.hincrby.assert_any_call("luma:llm_metrics:totals", "prompt_tokens:gemini/gemini-1.5-flash", 100)
        mock_pipe.hincrby.assert_any_call("luma:llm_metrics:totals", "completion_tokens", 50)
        mock_pipe.hincrby.assert_any_call("luma:llm_metrics:totals", "completion_tokens:gemini/gemini-1.5-flash", 50)
        mock_pipe.hincrby.assert_any_call("luma:llm_metrics:totals", "total_tokens", 150)
        mock_pipe.hincrby.assert_any_call("luma:llm_metrics:totals", "total_tokens:gemini/gemini-1.5-flash", 150)
        mock_pipe.execute.assert_called_once()

@pytest.mark.asyncio
async def test_llm_metrics_record_failure_does_not_increment_tokens():
    tracker = LLMMetricsTracker()
    mock_redis = MagicMock()
    mock_pipe = MagicMock()
    mock_pipe.execute = AsyncMock()
    mock_redis.pipeline.return_value = mock_pipe
    
    with patch.object(tracker, "_client", return_value=mock_redis):
        await tracker.record_event(
            event="failure",
            model="gemini/gemini-1.5-flash",
            provider="gemini",
            attempt="primary",
            error_type="APIError",
        )
        
        # Verify no token calls are made to hincrby
        for call in mock_pipe.hincrby.call_args_list:
            args = call[0]
            assert "prompt_tokens" not in args
            assert "completion_tokens" not in args
            assert "total_tokens" not in args
        mock_pipe.execute.assert_called_once()

@pytest.mark.asyncio
async def test_llm_metrics_snapshot():
    tracker = LLMMetricsTracker()
    mock_redis = MagicMock()
    mock_redis.hgetall = AsyncMock()
    mock_redis.lrange = AsyncMock()
    mock_redis.hgetall.side_effect = [
        # METRICS_HASH_KEY totals
        {
            "attempts": "5",
            "successes": "4",
            "failures": "1",
            "fallback_retries": "1",
            "prompt_tokens": "1000",
            "completion_tokens": "500",
            "total_tokens": "1500",
            "prompt_tokens:gemini/gemini-1.5-flash": "400",
            "completion_tokens:gemini/gemini-1.5-flash": "200",
            "prompt_tokens:anthropic/claude-sonnet-4-5": "600",
            "completion_tokens:anthropic/claude-sonnet-4-5": "300",
        },
        # METRICS_META_KEY meta
        {
            "last_success_at": "2026-06-04T00:00:00Z",
            "last_failure_at": "2026-06-04T00:01:00Z",
        }
    ]
    mock_redis.lrange.return_value = []
    
    with patch.object(tracker, "_client", return_value=mock_redis):
        snap = await tracker.snapshot()
        
        assert snap["totals"]["attempts"] == 5
        assert snap["totals"]["successes"] == 4
        assert snap["totals"]["failures"] == 1
        assert snap["totals"]["prompt_tokens"] == 1000
        assert snap["totals"]["completion_tokens"] == 500
        assert snap["totals"]["total_tokens"] == 1500
        
        assert snap["model_totals"]["prompt_tokens:gemini/gemini-1.5-flash"] == 400
        assert snap["model_totals"]["completion_tokens:gemini/gemini-1.5-flash"] == 200
        assert snap["model_totals"]["prompt_tokens:anthropic/claude-sonnet-4-5"] == 600
        assert snap["model_totals"]["completion_tokens:anthropic/claude-sonnet-4-5"] == 300
