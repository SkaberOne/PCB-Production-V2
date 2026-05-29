"""Configuration settings for ECB Production Manager."""

import logging
import os
from pathlib import Path
from typing import List, Optional


def _load_env_file(path: str = ".env") -> None:
    """Manually load .env file into os.environ for pydantic v1 compatibility.

    Pydantic v1 reads .env into fields but doesn't inject values into os.environ,
    so os.getenv() won't find them. This function fixes that by pre-loading the file.
    Only sets vars that are not already present in the environment.
    """
    env_path = Path(path)
    if not env_path.exists():
        return
    with open(env_path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value


# Load .env before pydantic Settings is instantiated so os.getenv() works
_load_env_file()

try:
    # pydantic v2
    from pydantic_settings import BaseSettings, SettingsConfigDict
    _PYDANTIC_V2 = True
except ImportError:
    # pydantic v1 fallback (Python 3.7)
    from pydantic import BaseSettings  # type: ignore[no-redef]
    SettingsConfigDict = None  # type: ignore[assignment]
    _PYDANTIC_V2 = False

    # --- pydantic v1 compatibility shims ---
    # In pydantic v1, model_validate() and model_dump() don't exist.
    # Patch BaseModel so routes written for pydantic v2 work without changes.
    from pydantic import BaseModel as _BaseModel

    if not hasattr(_BaseModel, "model_validate"):
        @classmethod  # type: ignore[misc]
        def _mv(cls, obj, **kw):  # type: ignore[misc]
            return cls.from_orm(obj)
        _BaseModel.model_validate = _mv  # type: ignore[attr-defined]

    if not hasattr(_BaseModel, "model_dump"):
        def _md(self, **kw):  # type: ignore[misc]
            exclude = kw.pop("exclude", None)
            include = kw.pop("include", None)
            return self.dict(exclude=exclude, include=include)
        _BaseModel.model_dump = _md  # type: ignore[attr-defined]


class Settings(BaseSettings):
    """Application settings loaded from environment variables and .env file.

    BaseSettings handles .env loading automatically — no os.getenv() needed here.
    Add a field and it maps to the matching env var (case-insensitive).
    """

    # API
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    api_env: str = "development"
    database_url_override: Optional[str] = None  # maps to DATABASE_URL
    api_key: Optional[str] = None  # X-API-Key; empty/absent = open (dev mode)

    # SQL Server
    sql_server_host: str = "localhost"
    sql_server_port: int = 1433
    sql_server_user: str = "sa"
    sql_server_password: str = ""
    sql_server_database: str = "ECB_Production"
    sql_server_driver: str = "ODBC Driver 17 for SQL Server"

    # Database URL (computed property — not a settings field)
    @property
    def database_url(self) -> str:
        """Build SQLAlchemy connection string for SQL Server or a DATABASE_URL override.

        Reads DATABASE_URL_OVERRIDE or DATABASE_URL (legacy) from env,
        compatible with both pydantic v1 and v2.
        """
        override = self.database_url_override or os.getenv("DATABASE_URL")
        if override:
            return override

        return (
            f"mssql+pyodbc://{self.sql_server_user}:{self.sql_server_password}"
            f"@{self.sql_server_host}:{self.sql_server_port}/{self.sql_server_database}"
            f"?driver={self.sql_server_driver.replace(' ', '+')}"
        )

    # Logging
    log_level: str = "INFO"
    log_file: Optional[str] = "logs/app.log"

    # File paths
    bom_import_folder: str = "./uploads/bom"
    export_folder: str = "./exports"
    harmonized_bom_folder: str = "./exports/bom_harmonized"
    database_backup_folder: str = "./backups"

    # CORS
    cors_origins: List[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
    ]

    # Supplier APIs (Phase 2)
    farnell_api_url: Optional[str] = None
    farnell_api_key: Optional[str] = None

    digikey_api_url: Optional[str] = None
    digikey_api_key: Optional[str] = None

    rs_api_url: Optional[str] = None
    rs_api_key: Optional[str] = None

    mouser_api_url: Optional[str] = None
    mouser_api_key: Optional[str] = None

    if _PYDANTIC_V2:
        model_config = SettingsConfigDict(
            env_file=".env",
            case_sensitive=False,
            extra="ignore",  # silently ignore unknown env vars (api_reload, etc.)
        )
    else:
        class Config:
            env_file = ".env"
            case_sensitive = False
            extra = "ignore"

# Create global settings instance
settings = Settings()

DATABASE_URL = settings.database_url


def _ensure_directories() -> None:
    """Create runtime folders expected by the application."""
    for folder in [
        settings.bom_import_folder,
        settings.export_folder,
        settings.harmonized_bom_folder,
        settings.database_backup_folder,
    ]:
        os.makedirs(folder, exist_ok=True)

    if settings.log_file:
        os.makedirs(os.path.dirname(settings.log_file) or "logs", exist_ok=True)


def _configure_logging() -> logging.Logger:
    """Attach file and console handlers once per process."""
    logger = logging.getLogger(__name__)
    logger.setLevel(settings.log_level)

    if logger.handlers:
        return logger

    formatter = logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s")

    if settings.log_file:
        file_handler = logging.FileHandler(settings.log_file)
        file_handler.setFormatter(formatter)
        logger.addHandler(file_handler)

    console_handler = logging.StreamHandler()
    console_handler.setFormatter(logging.Formatter("%(levelname)s - %(message)s"))
    logger.addHandler(console_handler)

    return logger


_ensure_directories()
logger = _configure_logging()
logger.info("ECB Production Manager started in %s mode", settings.api_env)
if settings.database_url.startswith("sqlite"):
    logger.info("Database: SQLite (%s)", settings.database_url)
else:
    logger.info("Database: %s", settings.database_url.split("@")[-1] if "@" in settings.database_url else settings.database_url)
