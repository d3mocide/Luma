"""HMAC signature verification tests for the HAE ingest endpoint."""
import hashlib
import hmac
import json
from unittest.mock import patch

import pytest

from tests.hae_fixtures import SAMPLE_PAYLOAD


def test_hmac_signature_valid():
    from fastapi import HTTPException
    from luma.api.ingest import _verify_hae_signature

    secret = "testsecret_at_least_32_bytes_long_!!"
    body = json.dumps(SAMPLE_PAYLOAD).encode()
    sig = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()

    with patch("luma.api.ingest.settings") as mock_settings:
        mock_settings.hae_shared_secret = secret
        _verify_hae_signature(body, sig)  # should not raise


def test_hmac_signature_wrong_secret_rejected():
    from fastapi import HTTPException
    from luma.api.ingest import _verify_hae_signature

    body = b'{"data":{}}'
    good_sig = hmac.new(b"correct_secret_32bytes_long_xxxxx", body, hashlib.sha256).hexdigest()

    with patch("luma.api.ingest.settings") as mock_settings:
        mock_settings.hae_shared_secret = "wrong_secret_32bytes_long_yyyyyy"
        with pytest.raises(HTTPException) as exc_info:
            _verify_hae_signature(body, good_sig)
    assert exc_info.value.status_code == 401


def test_hmac_signature_missing_header_rejected():
    from fastapi import HTTPException
    from luma.api.ingest import _verify_hae_signature

    with patch("luma.api.ingest.settings") as mock_settings:
        mock_settings.hae_shared_secret = "any_secret_32bytes_long_xxxxxxxxx"
        with pytest.raises(HTTPException) as exc_info:
            _verify_hae_signature(b"body", None)
    assert exc_info.value.status_code == 401


def test_hmac_signature_tampered_body_rejected():
    from fastapi import HTTPException
    from luma.api.ingest import _verify_hae_signature

    secret = "testsecret_at_least_32_bytes_long_!!"
    original_body = b'{"data":{"metrics":[]}}'
    sig = hmac.new(secret.encode(), original_body, hashlib.sha256).hexdigest()
    tampered_body = b'{"data":{"metrics":[],"injected":true}}'

    with patch("luma.api.ingest.settings") as mock_settings:
        mock_settings.hae_shared_secret = secret
        with pytest.raises(HTTPException) as exc_info:
            _verify_hae_signature(tampered_body, sig)
    assert exc_info.value.status_code == 401


def test_hmac_accepts_lowercase_signature():
    from luma.api.ingest import _verify_hae_signature

    secret = "testsecret_at_least_32_bytes_long_!!"
    body = b'{"data":{}}'
    sig = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest().upper()

    with patch("luma.api.ingest.settings") as mock_settings:
        mock_settings.hae_shared_secret = secret
        _verify_hae_signature(body, sig)  # should not raise
