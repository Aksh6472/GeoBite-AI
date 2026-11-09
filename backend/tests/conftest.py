import os
import sys
import tempfile
from pathlib import Path

_tmp = tempfile.mkdtemp(prefix="geobite_test_")
# Set TEST_DATABASE_URL=postgresql+psycopg://... to run the suite against PostGIS (schema is rebuilt via Alembic).
os.environ["DATABASE_URL"] = os.environ.get("TEST_DATABASE_URL", f"sqlite:///{_tmp}/test.db")
os.environ["UPLOAD_DIR"] = f"{_tmp}/uploads"
os.environ["ENVIRONMENT"] = "test"
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.database import Base, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.ratelimit import limiter  # noqa: E402

PASSWORD = "GeoBite#2026"


@pytest.fixture(scope="session", autouse=True)
def seeded_db():
    if engine.dialect.name == "postgresql":
        from alembic import command
        from alembic.config import Config
        from sqlalchemy import text

        with engine.begin() as conn:
            conn.execute(text("DROP SCHEMA public CASCADE; CREATE SCHEMA public"))
        command.upgrade(Config(str(Path(__file__).resolve().parent.parent / "alembic.ini")), "head")
    else:
        Base.metadata.create_all(engine)
    import seed

    sys.argv = ["seed.py"]
    seed.main()
    yield


@pytest.fixture(autouse=True)
def _reset_limits():
    limiter.reset()
    yield


@pytest.fixture
def client():
    return TestClient(app)


def login(client: TestClient, email: str) -> TestClient:
    r = client.post("/api/auth/login", json={"email": email, "password": PASSWORD})
    assert r.status_code == 200, r.text
    return client


@pytest.fixture
def admin(client):
    return login(client, "admin@geobite.demo")


@pytest.fixture
def hospital(client):
    return login(client, "hospital.chennai@geobite.demo")


def make_client(email: str | None = None, ip: str = "10.0.0.1") -> TestClient:
    c = TestClient(app, headers={"x-forwarded-for": ip})
    if email:
        login(c, email)
    return c
