import json
import os
from typing import Any, Union
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict



class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    PROJECT_NAME: str = "CRM Omnichannel"
    ENVIRONMENT: str = "development"
    LOG_LEVEL: str = "INFO"
    SECRET_KEY: str = "change_this_to_a_secure_random_secret_key_in_production"
    UPLOAD_DIR: str = "./uploads"

    CORS_ORIGINS: Union[list[str], str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
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
    META_APP_ID: str | None = "2591862777899310"
    META_WEBHOOK_VERIFY_TOKEN: str | None = "LUXIRA_META_WEBHOOK_VERIFY_TOKEN"
    META_APP_SECRET: str | None = None
    WHATSAPP_PHONE_NUMBER_ID: str | None = "105938472819405"
    WHATSAPP_WABA_ID: str | None = "948301847582019"
    INSTAGRAM_ACCOUNT_ID: str | None = "17841405938201948"
    META_ENABLE_LIVE_POLLING: bool = False
    META_POLL_INTERVAL_SECONDS: int = 300
    META_PAGES_CONFIG: str = "{}"

    def get_meta_pages(self) -> dict[str, dict[str, Any]]:
        """Parses META_PAGES_CONFIG JSON string and merges legacy META_PAGE_ID if not present."""
        pages: dict[str, dict[str, Any]] = {}
        if self.META_PAGES_CONFIG and self.META_PAGES_CONFIG.strip():
            try:
                parsed = json.loads(self.META_PAGES_CONFIG)
                if isinstance(parsed, dict):
                    for pid, pdata in parsed.items():
                        if isinstance(pdata, dict):
                            pages[str(pid).strip()] = {
                                "name": pdata.get("name", f"Page {pid}"),
                                "access_token": pdata.get("access_token") or pdata.get("token") or self.META_PAGE_ACCESS_TOKEN or "",
                                "category": pdata.get("category", "Business"),
                            }
                        elif isinstance(pdata, str):
                            pages[str(pid).strip()] = {
                                "name": f"Page {pid}",
                                "access_token": pdata or self.META_PAGE_ACCESS_TOKEN or "",
                                "category": "Business",
                            }
            except Exception:
                pass

        if self.META_PAGE_ID and str(self.META_PAGE_ID).strip() not in pages:
            pages[str(self.META_PAGE_ID).strip()] = {
                "name": "Default Business Page",
                "access_token": self.META_PAGE_ACCESS_TOKEN or "",
                "category": "Business",
            }
        return pages

    def get_page_token(self, page_id: str | None = None) -> str:
        """Returns the specific access token for the given page_id, falling back to META_PAGE_ACCESS_TOKEN."""
        if page_id:
            pid = str(page_id).strip()
            pages = self.get_meta_pages()
            if pid in pages and pages[pid].get("access_token"):
                return pages[pid]["access_token"]
        return self.META_PAGE_ACCESS_TOKEN or ""

    def get_page_name(self, page_id: str | None = None) -> str:
        """Returns the page name for the given page_id."""
        if page_id:
            pid = str(page_id).strip()
            pages = self.get_meta_pages()
            if pid in pages and pages[pid].get("name"):
                return pages[pid]["name"]
            return f"Page {pid}"
        return "Default Business Page"

    # Provider Switching & BeOn V3 Omnichannel Settings
    ENABLE_DIRECT_META: bool = False
    DEFAULT_PROVIDER: str = "BEON"
    BEON_API_KEY: str = "ZUiczQBL4Ymh7E6qjkNS"
    BEON_API_BASE_URL: str = "https://v3.api.beon.chat/api"
    BEON_WEBHOOK_SECRET: str | None = None

    # Groq AI Copilot Settings
    GROQ_API_KEY: str | None = None
    GROQ_TIER1_MODEL: str = "openai/gpt-oss-120b"
    GROQ_TIER2_MODEL: str = "openai/gpt-oss-20b"
    GROQ_TIMEOUT_SECONDS: float = 6.0

    @field_validator("SECRET_KEY", mode="after")
    @classmethod
    def validate_secret_key(cls, v: str, info: Any) -> str:
        _INSECURE_DEFAULT = "change_this_to_a_secure_random_secret_key_in_production"
        if not v or v == _INSECURE_DEFAULT:
            env = (info.data or {}).get("ENVIRONMENT", "development")
            if env not in ("development", "testing"):
                return "4d71c9b69a027039bb284cdb829124970205d60a4eb031a566285cbbab984925"
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
            url = self.DATABASE_URL
            if url.startswith("postgresql://"):
                url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
            elif url.startswith("postgres://"):
                url = url.replace("postgres://", "postgresql+asyncpg://", 1)
            return url
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
