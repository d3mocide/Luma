"""Set required env vars before any module-level settings are instantiated."""
import os
import sys
from types import ModuleType
from unittest.mock import AsyncMock, MagicMock

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://test:test@localhost/testdb")
os.environ.setdefault("JWT_SECRET", "test_jwt_secret_for_tests_only_xxxxxxxxxxxxxxxxx")
os.environ.setdefault("HAE_SHARED_SECRET", "test_hae_shared_secret_for_tests_32bytes!")

# ── Native-dependency stubs ───────────────────────────────────────────────────
# The system cryptography/asyncpg packages use native extensions that are
# unavailable in the lightweight CI test runner.  Docker runs the real stack;
# these stubs let the test suite run without it.

if "jwt" not in sys.modules:
    _jwt_stub = ModuleType("jwt")
    _jwt_stub.decode = MagicMock(return_value={"sub": "00000000-0000-0000-0000-000000000000"})
    _jwt_stub.ExpiredSignatureError = Exception
    _jwt_stub.InvalidTokenError = Exception
    sys.modules["jwt"] = _jwt_stub

_MISSING_NATIVE = (
    "asyncpg",
    "litellm",
    "arq",
    "argon2",
    "argon2.exceptions",
    "redis",
    "redis.asyncio",
    "redis.exceptions",
    "redis.client",
)
for _mod in _MISSING_NATIVE:
    if _mod not in sys.modules:
        sys.modules[_mod] = MagicMock()

# orjson: use a functional stub backed by stdlib json so serialization in
# normalize_hae_payload works correctly in tests (a pure MagicMock stub would
# return MagicMock objects from dumps/loads, breaking the capturing helper).
if "orjson" not in sys.modules:
    import json as _json
    _orjson_stub = ModuleType("orjson")
    _orjson_stub.dumps = lambda obj, **kw: _json.dumps(obj, default=str).encode()
    _orjson_stub.loads = _json.loads
    _orjson_stub.OPT_NON_STR_KEYS = 0
    sys.modules["orjson"] = _orjson_stub

# Stub the session module so create_async_engine is never called at import time.
if "luma.db.session" not in sys.modules:
    _session_stub = ModuleType("luma.db.session")
    _session_stub.AsyncSessionLocal = MagicMock()
    _session_stub.engine = MagicMock()
    sys.modules["luma.db.session"] = _session_stub
