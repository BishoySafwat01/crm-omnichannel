import json
import os
from typing import Any
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict



class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    PROJECT_NAME: str = "CRM Omnichannel"
    ENVIRONMENT: str = "development"
    LOG_LEVEL: str = "INFO"
    SECRET_KEY: str = "change_this_to_a_secure_random_secret_key_in_production"
    UPLOAD_DIR: str = "./uploads"

    CORS_ORIGINS: list[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
    ]

    POSTGRES_USER: str = "postgres"
    POSTGRES_PASSWORD: str = "postgres_password"
    POSTGRES_DB: str = "crm_omnichannel"
    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: int = 5432
    DATABASE_URL: str | None = None

    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379
    REDIS_URL: str | None = None

    # Meta Integration Settings
    META_PAGE_ID: str | None = "1302055352987458"
    META_PAGE_ACCESS_TOKEN: str | None = None
    META_GRAPH_API_VERSION: str = "v19.0"
    META_WEBHOOK_VERIFY_TOKEN: str | None = "LUXIRA_META_WEBHOOK_VERIFY_TOKEN"
    META_APP_SECRET: str | None = None
    WHATSAPP_PHONE_NUMBER_ID: str | None = "105938472819405"
    WHATSAPP_WABA_ID: str | None = "948301847582019"
    INSTAGRAM_ACCOUNT_ID: str | None = "17841405938201948"

    # Respond.io Integration Settings
    RESPOND_IO_API_TOKEN: str | None = None
    RESPOND_IO_API_BASE_URL: str = "https://api.respond.io/v2"
    RESPOND_IO_WEBHOOK_SECRET: str | None = ""

    # Groq AI Copilot Settings
    GROQ_API_KEY: str | None = None
    GROQ_TIER1_MODEL: str = "openai/gpt-oss-120b"
    GROQ_TIER2_MODEL: str = "openai/gpt-oss-20b"
    GROQ_TIMEOUT_SECONDS: float = 6.0

    @field_validator("SECRET_KEY", mode="after")
    @classmethod
    def validate_secret_key(cls, v: str, info: Any) -> str:
        _INSECURE_DEFAULT = "change_this_to_a_secure_random_secret_key_in_production"
        if v == _INSECURE_DEFAULT:
            env = (info.data or {}).get("ENVIRONMENT", "development")
            if env not in ("development", "testing"):
                raise ValueError(
                    "SECRET_KEY must be changed from the default placeholder in non-development environments. "
                    "Generate one with: python -c \"import secrets; print(secrets.token_hex(32))\""
                )
        return v

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Any) -> list[str]:
        if isinstance(v, str):
            v_trimmed = v.strip()
            if v_trimmed.startswith("[") and v_trimmed.endswith("]"):
                return json.loads(v_trimmed)
            return [i.strip() for i in v_trimmed.split(",") if i.strip()]
        if isinstance(v, list):
            return v
        raise ValueError(f"Invalid CORS_ORIGINS format: {v}")

    @property
    def async_database_url(self) -> str:
        if self.DATABASE_URL:
            return self.DATABASE_URL
        return (
            f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    @property
    def async_redis_url(self) -> str:
        if self.REDIS_URL:
            return self.REDIS_URL
        return f"redis://{self.REDIS_HOST}:{self.REDIS_PORT}/0"


settings = Settings()
