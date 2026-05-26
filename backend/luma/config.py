from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator
from typing import Any, Literal


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str
    redis_url: str = "redis://localhost:6379/0"

    jwt_secret: str
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7

    hae_shared_secret: str

    local_ai_api_base: str = ""
    whisper_url: str = "http://whisper:9000"
    anthropic_api_key: str = ""
    gemini_api_key: str = ""
    
    # Custom model names and API keys for full model/endpoint agnosticism
    food_extractor_model: str = "food-extractor"
    meal_planner_model: str = "meal-planner"
    local_ai_api_key: str = ""

    environment: Literal["development", "production"] = "development"
    cors_origins: Any = ["http://localhost:5173"]

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors(cls, v: Any) -> list[str]:
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",")]
        return v

    @property
    def is_production(self) -> bool:
        return self.environment == "production"


settings = Settings()
