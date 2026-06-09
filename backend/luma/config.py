from typing import Any, Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str
    redis_url: str = "redis://localhost:6379/0"

    jwt_secret: str
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7

    hae_shared_secret: str = ""  # app-level secret; sent as X-HAE-Signature header by HAE

    local_ai_api_base: str = ""
    local_ai_api_key: str = ""
    whisper_url: str = "http://whisper:9000"
    anthropic_api_key: str = ""
    gemini_api_key: str = ""
    usda_api_key: str = ""

    # Primary model routes — prefix determines provider:
    #   local/<id>     → LOCAL_AI_API_BASE (Ollama / LocalAI)
    #   gemini/<id>    → Gemini via GEMINI_API_KEY
    #   anthropic/<id> → Anthropic API
    food_extractor_model: str = "gemini/gemini-3.5-flash"
    vision_classifier_model: str = "gemini/gemini-3.5-flash"
    meal_planner_model: str = "anthropic/claude-sonnet-4-5"
    coach_model: str = "gemini/gemini-3.5-flash"
    insight_narrator_model: str = "gemini/gemini-3.5-flash"

    # Optional fallback routes — used if the primary call fails (e.g. local model down).
    # Leave blank to disable fallback for that role.
    food_extractor_fallback_model: str = ""
    vision_classifier_fallback_model: str = ""
    meal_planner_fallback_model: str = ""
    coach_fallback_model: str = ""
    insight_narrator_fallback_model: str = ""
    recipe_import_model: str = "gemini/gemini-3.5-flash"
    recipe_import_fallback_model: str = ""

    # VAPID keys for Web Push (generate with: python -m py_vapid --gen)
    vapid_private_key: str = ""
    vapid_public_key: str = ""
    vapid_claims_email: str = "admin@example.com"

    # SMTP — used for family invitation emails.
    # Leave smtp_host blank to disable email sending (invite tokens still work via manual link share).
    #
    # Basic Auth (Mailgun, Postmark, Gmail, etc.):
    #   Set smtp_host, smtp_port, smtp_user, smtp_password, smtp_from.
    #   Leave smtp_tenant_id blank.
    #
    # Microsoft 365 OAuth (recommended for M365 tenants):
    #   Set smtp_host=smtp.office365.com, smtp_port=587, smtp_from=<licensed mailbox>.
    #   Set smtp_tenant_id, smtp_client_id, smtp_client_secret from your Azure AD app registration.
    #   The app needs the SMTP.SendMail application permission with admin consent.
    #   Leave smtp_user and smtp_password blank.
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = "noreply@example.com"
    smtp_use_tls: bool = True
    # OAuth 2.0 Client Credentials SMTP — leave smtp_oauth_token_url blank to use Basic Auth instead.
    # Works with any provider that supports SASL XOAUTH2 (M365, Google Workspace, etc.).
    smtp_oauth_token_url: str = ""
    smtp_oauth_client_id: str = ""
    smtp_oauth_client_secret: str = ""
    smtp_oauth_scope: str = ""

    # Base URL used to build links in outbound emails (no trailing slash).
    app_base_url: str = "http://localhost:5173"

    server_timezone: str = "UTC"

    environment: Literal["development", "production"] = "development"
    cors_origins: Any = ["http://localhost:5173"]

    @field_validator("server_timezone")
    @classmethod
    def validate_timezone(cls, v: str) -> str:
        try:
            ZoneInfo(v)
        except (ZoneInfoNotFoundError, KeyError):
            raise ValueError(f"Unknown timezone {v!r} — use an IANA name like 'America/New_York'.")
        return v

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors(cls, v: Any) -> list[str]:
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",")]
        return v

    @property
    def is_production(self) -> bool:
        return self.environment == "production"


settings = Settings()  # type: ignore[call-arg]
