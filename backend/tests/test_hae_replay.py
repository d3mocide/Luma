"""Replay protection tests for the HAE ingest endpoint."""
from unittest.mock import AsyncMock, patch

import pytest


@pytest.mark.asyncio
async def test_replay_first_request_accepted():
    from luma.api.ingest import _check_replay

    mock_redis = AsyncMock()
    mock_redis.set.return_value = True  # nx=True, key was new

    with patch("luma.api.ingest._get_redis", return_value=mock_redis):
        await _check_replay("abc123sig")  # should not raise

    mock_redis.set.assert_awaited_once_with("hae:replay:abc123sig", "1", nx=True, ex=600)


@pytest.mark.asyncio
async def test_replay_duplicate_rejected():
    from fastapi import HTTPException

    from luma.api.ingest import _check_replay

    mock_redis = AsyncMock()
    mock_redis.set.return_value = None  # nx=True, key already existed

    with patch("luma.api.ingest._get_redis", return_value=mock_redis):
        with pytest.raises(HTTPException) as exc_info:
            await _check_replay("already_seen_sig")

    assert exc_info.value.status_code == 409


@pytest.mark.asyncio
async def test_replay_redis_down_fails_open():
    from luma.api.ingest import _check_replay

    mock_redis = AsyncMock()
    mock_redis.set.side_effect = ConnectionError("Redis unreachable")

    with patch("luma.api.ingest._get_redis", return_value=mock_redis):
        await _check_replay("some_sig")  # should not raise
