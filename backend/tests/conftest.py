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
    "orjson",
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

# Stub the session module so create_async_engine is never called at import time.
if "luma.db.session" not in sys.modules:
    _session_stub = ModuleType("luma.db.session")
    _session_stub.AsyncSessionLocal = MagicMock()
    sys.modules["luma.db.session"] = _session_stub
