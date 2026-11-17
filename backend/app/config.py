from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    APP_ENV: str = "development"
    APP_HOST: str = "0.0.0.0"
    APP_PORT: int = 8000
    CORS_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173"

    # Por defecto usa SQLite local para desarrollo inmediato sin dependencias externas;
    # en producción / Docker usa postgresql+psycopg://...
    DATABASE_URL: str = "sqlite:///./nubera_rrhh.db"

    JWT_SECRET: str = "nubera-digital-dev-secret-2026-cambiar-en-prod"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 480

    LLM_PROVIDER: str = "none"
    LLM_MODEL: str = "deepseek-chat"
    EMBEDDING_MODEL: str = "local-384"
    DEEPSEEK_API_KEY: str = ""
    DEEPSEEK_BASE_URL: str = "https://api.deepseek.com"
    OPENAI_API_KEY: str = ""
    GEMINI_API_KEY: str = ""
    EMBEDDING_DIM: int = 384

    GOOGLE_DRIVE_ENABLED: bool = False
    GOOGLE_AUTH_MODE: str = "oauth2"  # "oauth2" | "service_account"
    GOOGLE_DRIVE_FOLDER_ID: str = ""
    GOOGLE_SERVICE_ACCOUNT_FILE: str = ""
    GOOGLE_SERVICE_ACCOUNT_JSON: str = ""
    GOOGLE_OAUTH_CLIENT_ID: str = ""
    GOOGLE_OAUTH_CLIENT_SECRET: str = ""
    GOOGLE_OAUTH_CLIENT_FILE: str = "client_secret.json"
    GOOGLE_OAUTH_TOKEN_FILE: str = "token.json"
    GOOGLE_OAUTH_REDIRECT_URI: str = "http://localhost:8000/api/auth/google/callback"

    TIMEZONE: str = "America/Mexico_City"
    ANALYST_CRON_HOUR: int = 7
    ANALYST_CRON_MINUTE: int = 0
    INGESTION_CRON_HOUR: int = 6
    INGESTION_CRON_MINUTE: int = 30

    @property
    def cors_origins_list(self) -> List[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

    @property
    def is_postgres(self) -> bool:
        return self.DATABASE_URL.startswith("postgresql")


settings = Settings()
