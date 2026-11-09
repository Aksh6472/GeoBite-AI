from collections.abc import Generator

from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import get_settings

settings = get_settings()

if settings.database_url.startswith("sqlite"):
    _connect_args: dict = {"check_same_thread": False}
else:
    # Server-side prepared statements break behind transaction-mode poolers (Neon, PgBouncer).
    _connect_args = {"prepare_threshold": None}
engine = create_engine(settings.database_url, connect_args=_connect_args, pool_pre_ping=True, pool_recycle=300)

if settings.database_url.startswith("sqlite"):

    @event.listens_for(engine, "connect")
    def _sqlite_fk(dbapi_conn, _):  # enforce FK constraints on SQLite
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA foreign_keys=ON")
        cur.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


_postgis: bool | None = None


def has_postgis() -> bool:
    """True when the database is PostgreSQL with the PostGIS extension and geometry columns installed.
    Spatial services use PostGIS SQL when available and fall back to Python haversine otherwise."""
    global _postgis
    if _postgis is None:
        if not settings.is_postgres:
            _postgis = False
        else:
            try:
                with engine.connect() as c:
                    _postgis = bool(c.execute(text(
                        "SELECT 1 FROM pg_extension WHERE extname='postgis'"
                        " AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='community_reports' AND column_name='geom')"
                    )).first())
            except Exception:
                _postgis = False
    return _postgis
