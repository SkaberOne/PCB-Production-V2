"""Configuration settings for PCB Flow Production Suite."""

import logging
import os
from pathlib import Path
from typing import List, Optional
from urllib.parse import quote_plus


def _load_env_file(path: str = ".env") -> None:
    """Manually load .env file into os.environ for pydantic v1 compatibility.

    Pydantic v1 reads .env into fields but doesn't inject values into os.environ,
    so os.getenv() won't find them. This function fixes that by pre-loading the file.
    Only sets vars that are not already present in the environment.
    """
    env_path = Path(path)
    if not env_path.exists():
        return
    # Tolère les .env enregistrés par Notepad / PowerShell (`echo > .env` produit
    # de l'UTF-16 avec BOM). On sniffe le BOM avant de décoder pour éviter un
    # UnicodeDecodeError au démarrage (byte 0xff en UTF-16 LE).
    raw = env_path.read_bytes()
    if raw.startswith((b"\xff\xfe", b"\xfe\xff")):
        text = raw.decode("utf-16", errors="ignore")
    elif raw.startswith(b"\xef\xbb\xbf"):
        text = raw.decode("utf-8-sig", errors="ignore")
    else:
        text = raw.decode("utf-8", errors="ignore")
    for line in text.splitlines():
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
    api_env: str = "development"  # "production" → /docs et /redoc désactivés
    database_url_override: Optional[str] = None  # maps to DATABASE_URL
    api_key: Optional[str] = None  # X-API-Key; empty/absent = open (dev mode)
    max_upload_mb: int = 25  # taille max d'un fichier importé (écart D9)

    # SQL Server
    sql_server_host: str = "localhost"
    sql_server_port: int = 1433
    sql_server_user: str = "sa"
    sql_server_password: str = ""
    sql_server_database: str = "ECB_Production"
    sql_server_driver: str = "ODBC Driver 17 for SQL Server"
    # Chiffrement TLS de la connexion SQL (écart D-TLS) : configurable via
    # SQL_ENCRYPT. Défaut "yes" (sécurisé). En LAN, peut être ramené à "no" si
    # la négociation TLS du driver 17.10+ est trop lente/instable (erreur 87).
    sql_encrypt: str = "yes"

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

        # URL-encoder user et mot de passe : supporte les caractères spéciaux
        # (@ : / etc.) qui cassaient silencieusement la connexion (écart D7).
        user = quote_plus(self.sql_server_user)
        password = quote_plus(self.sql_server_password)
        # Encrypt configurable (SQL_ENCRYPT, défaut "yes") + TrustServerCertificate=yes.
        # Historique : le driver 17.10+ chiffre par défaut et fait parfois une
        # négociation TLS lente (8-22 s) / erreur 87 au démarrage ; en LAN sur SQL
        # Server de confiance, SQL_ENCRYPT=no rétablit une connexion ~2 s.
        return (
            f"mssql+pyodbc://{user}:{password}"
            f"@{self.sql_server_host}:{self.sql_server_port}/{self.sql_server_database}"
            f"?driver={self.sql_server_driver.replace(' ', '+')}"
            f"&Encrypt={self.sql_encrypt}&TrustServerCertificate=yes"
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

    # Accès web LAN : dossier du build React à servir par le backend (mode serveur
    # partagé, un seul port sert l'UI + l'API). Vide par défaut → le backend reste
    # une API pure (dev / app packagée). Défini via l'env WEB_STATIC_DIR par
    # DEMARRER_SERVEUR_WEB.bat. Le frontend web appelle /api (même origine) → pas
    # de CORS. Combiner avec API_KEY pour exiger la clé partagée X-API-Key.
    web_static_dir: Optional[str] = None

    # Supplier APIs
    # Farnell / element14 Product Search API (REST). Inactive until api_key is set.
    farnell_api_url: Optional[str] = None
    farnell_api_key: Optional[str] = None
    farnell_store_id: str = "fr.farnell.com"
    farnell_currency: str = "EUR"

    # DigiKey — OAuth2 2-legged (client credentials). Inactive until id+secret set.
    digikey_api_url: Optional[str] = None
    digikey_api_key: Optional[str] = None  # legacy/unused, kept for compatibility
    digikey_client_id: Optional[str] = None
    digikey_client_secret: Optional[str] = None
    digikey_oauth_url: Optional[str] = None
    digikey_locale_site: str = "FR"
    digikey_locale_currency: str = "EUR"
    digikey_locale_language: str = "fr"

    # RS / RS Components (DigiProc API). Auth = Client-Id + Client-Secret headers.
    # Inactive until client_id + client_secret are set. customer_number is only
    # needed for the Customer-Pricing endpoint.
    rs_api_url: Optional[str] = None
    rs_api_key: Optional[str] = None  # legacy/unused, kept for compatibility
    rs_client_id: Optional[str] = None
    rs_client_secret: Optional[str] = None
    rs_country_code: str = "FR"  # ISO code used in path + countryCode query
    rs_language: str = "FR_FR"
    rs_currency: str = "EUR"
    rs_customer_number: Optional[str] = None  # required only for Customer-Pricing

    mouser_api_url: Optional[str] = None
    mouser_api_key: Optional[str] = None

    # Supplier offers cache (ADR 0004)
    supplier_offer_ttl_hours: int = 24

    # ERP purchase-request defaults (editable in admin screen; ADR 0004 / audit 2026-06-03)
    erp_default_project: str = "PJ2601-00241 - Achat projet client 2026"
    erp_default_unit: str = "pièce"
    erp_default_requester: str = "Eric Bouquet"
    erp_default_validator: str = "Kevin Surrier"
    erp_default_delay: str = "URGENT"
    erp_default_remark: str = "mise en bobine"

    # NB : on NE passe PAS env_file à pydantic. Le .env est déjà chargé dans
    # os.environ par _load_env_file() (robuste aux BOM UTF-8/UTF-16). Laisser
    # pydantic relire le fichier provoquait un UnicodeDecodeError sur les .env
    # UTF-16 (python-dotenv lit en utf-8 strict).
    if _PYDANTIC_V2:
        model_config = SettingsConfigDict(
            case_sensitive=False,
            extra="ignore",  # silently ignore unknown env vars (api_reload, etc.)
        )
    else:
        class Config:
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
logger.info("PCB Flow Production Suite started in %s mode", settings.api_env)
if settings.database_url.startswith("sqlite"):
    logger.info("Database: SQLite (%s)", settings.database_url)
else:
    logger.info("Database: %s", settings.database_url.split("@")[-1] if "@" in settings.database_url else settings.database_url)
