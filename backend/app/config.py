"""Environment-based configuration. All secrets come from the environment / .env file."""
from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(BASE_DIR / ".env", BASE_DIR.parent / ".env"), extra="ignore")

    app_name: str = "GeoBite-AI"
    environment: str = Field(default="development", description="development | test | production")

    # Database: PostgreSQL + PostGIS in production; SQLite fallback for quick local runs/tests.
    database_url: str = f"sqlite:///{BASE_DIR / 'geobite_dev.db'}"

    # Security
    jwt_secret: str = "CHANGE-ME-dev-only-secret-0123456789abcdef"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 8
    cookie_secure: bool = False
    cookie_name: str = "gb_token"
    cors_origins: str = "http://localhost:3000"
    ip_hash_salt: str = "CHANGE-ME-ip-salt"
    # Trust X-Forwarded-For (only when the API is reachable exclusively through the Next.js proxy / a load balancer)
    trust_proxy: bool = True

    # Community portal protections
    rate_limit_reports_per_hour: int = 10
    rate_limit_login_per_15min: int = 20
    dedup_radius_m: float = 150.0
    cluster_window_days: int = 30  # reports of the same place within this window chain into one dog-group cluster
    duplicate_window_hours: int = 48  # same reporter, same cluster, within this window -> probable duplicate

    # Privacy
    public_min_cell_count: int = 3  # k-anonymity threshold for public aggregated layers
    public_grid_deg: float = 0.005  # ~550 m snapping grid for public community layer

    # Uploads / retention
    upload_dir: str = str(BASE_DIR / "uploads")
    max_upload_mb: int = 5
    retention_photo_days: int = 365
    retention_ip_hash_days: int = 30

    @property
    def is_postgres(self) -> bool:
        return self.database_url.startswith("postgresql")

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    # Hosted providers (Render, Heroku, Neon) hand out postgres:// URLs; use the psycopg 3 driver.
    for prefix in ("postgres://", "postgresql://"):
        if s.database_url.startswith(prefix):
            s.database_url = "postgresql+psycopg://" + s.database_url[len(prefix):]
    if s.environment == "production" and s.jwt_secret.startswith("CHANGE-ME"):
        raise RuntimeError("JWT_SECRET must be set in production")
    return s
