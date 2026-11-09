import hashlib
import hmac
import logging
import time
import uuid

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from .config import get_settings
from . import database
from .database import SessionLocal, has_postgis
from .routers import admin, alerts, analytics, auth, community, dashboard, hospital, map, meta, vaccination

settings = get_settings()
logging.basicConfig(level=logging.INFO, format='{"ts":"%(asctime)s","level":"%(levelname)s","logger":"%(name)s","msg":%(message)s}')
log = logging.getLogger("geobite")

app = FastAPI(
    title="GeoBite-AI API",
    version="1.0.0",
    description=(
        "Integrated geospatial intelligence platform for dog-bite surveillance, stray-dog population mapping and "
        "One Health prevention. Research prototype - demonstration data is synthetic."
    ),
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)
app.add_middleware(
    CORSMiddleware, allow_origins=settings.cors_origin_list, allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"], allow_headers=["Authorization", "Content-Type"],
)


@app.middleware("http")
async def request_context(request: Request, call_next):
    rid = request.headers.get("x-request-id") or uuid.uuid4().hex[:12]
    start = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        log.exception('"unhandled error rid=%s path=%s"', rid, request.url.path)
        response = JSONResponse({"detail": "Internal server error", "request_id": rid}, status_code=500)
    response.headers["X-Request-ID"] = rid
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    log.info('"%s %s %s %.1fms rid=%s"', request.method, request.url.path, response.status_code, (time.perf_counter() - start) * 1000, rid)
    return response


@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError):
    errors = []
    for e in exc.errors():
        loc = [str(x) for x in e["loc"] if x not in ("body",)]
        msg = e["msg"].removeprefix("Value error, ")
        errors.append({"field": ".".join(loc), "msg": msg})
    return JSONResponse({"detail": errors}, status_code=422)


for r in (auth, meta, hospital, community, map, dashboard, analytics, alerts, vaccination, admin):
    app.include_router(r.router, prefix="/api")


@app.get("/api/health", tags=["system"])
def health():
    db_ok = True
    try:
        with SessionLocal() as s:
            s.execute(text("SELECT 1"))
    except Exception:
        db_ok = False
    return {"status": "ok" if db_ok else "degraded", "database": "ok" if db_ok else "unreachable", "backend": "postgresql" if settings.is_postgres else "sqlite", "postgis": has_postgis(), "environment": settings.environment}


def bootstrap_token() -> str:
    return hmac.new(settings.jwt_secret.encode(), b"geobite-bootstrap", hashlib.sha256).hexdigest()


@app.post("/api/system/bootstrap", tags=["system"], include_in_schema=False)
def bootstrap(x_bootstrap_token: str = Header(default="")):
    """Apply migrations and load the synthetic demo data on hosts where no shell is available
    (e.g. Vercel). Authorised by a token derived from JWT_SECRET; both steps are idempotent."""
    if not settings.is_postgres or not hmac.compare_digest(x_bootstrap_token, bootstrap_token()):
        raise HTTPException(404, "Not found")
    from pathlib import Path

    from alembic import command
    from alembic.config import Config

    root = Path(__file__).resolve().parent.parent
    cfg = Config(str(root / "alembic.ini"))
    cfg.set_main_option("script_location", str(root / "alembic"))
    command.upgrade(cfg, "head")
    database._postgis = None  # re-detect PostGIS now that the geometry columns exist
    import seed  # backend/seed.py; only loads data into an empty database

    seeded = seed.seed()
    return {"migrated": True, "seeded": seeded, "postgis": has_postgis()}
