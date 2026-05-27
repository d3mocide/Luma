"""Set required env vars before any module-level settings are instantiated."""
import os

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://test:test@localhost/testdb")
os.environ.setdefault("JWT_SECRET", "test_jwt_secret_for_tests_only_xxxxxxxxxxxxxxxxx")
os.environ.setdefault("HAE_SHARED_SECRET", "test_hae_shared_secret_for_tests_32bytes!")
