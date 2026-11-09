# GeoBite-AI

**An Integrated Geospatial Intelligence Platform for Dog-Bite Surveillance, Stray Dog Population Mapping and One Health Prevention.**

GeoBite-AI joins two data streams that normally live in separate departments:

1. **Hospitals and PHCs** reporting human dog-bite incidents.
2. **Residents** reporting stray-dog sightings, population estimates and observed behaviour.

Both portals write to one PostgreSQL/PostGIS database. A third portal, the **intelligence console**, combines them for medical, veterinary and municipal officers: a five-layer GIS map, hotspot statistics (KDE, DBSCAN, Getis-Ord Gi*), a transparent One Health priority index, a prototype risk model, and an audited alert-to-intervention workflow.

> **Research prototype. All demonstration data is synthetic.** Real hospital data should be integrated only after institutional ethics approval and formal data-sharing agreements. The platform supports, and does not replace, medical and veterinary judgement.

---

## Quick start

### Go live on the internet (Render)

Push this repository to GitHub, then in Render choose **New > Blueprint** and select it. `render.yaml` creates the database and the web service, generates secrets, runs migrations and seeds the demo data. Full steps and free-plan limits: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md#go-live-on-render-recommended-one-click-blueprint).

### Option A: Docker (one command)

```bash
cp .env.example .env            # then set JWT_SECRET and IP_HASH_SALT
docker compose up --build
```

| Service | URL |
|---|---|
| Web app | http://localhost:3000 |
| API + Swagger docs | http://localhost:8010/api/docs |
| PostGIS | localhost:5433 (`geobite` / `geobite_dev_password`) |

On first start the API container runs the migrations and seeds the synthetic data (`SEED_ON_START=true`; the seed is idempotent).

### Option B: Local development

Prerequisites: Python 3.12, Node 20+, and Docker for PostGIS (or use the SQLite fallback).

```bash
# 1. Database (PostGIS)
docker compose up -d db

# 2. Backend
cd backend
python3.12 -m venv .venv && source .venv/bin/activate     # or: uv venv --python 3.12 .venv
pip install -r requirements-dev.txt
cp ../.env.example .env                                    # DATABASE_URL points at localhost:5433
alembic upgrade head                                       # migrations
python seed.py                                             # synthetic Tamil Nadu data (--reset to re-seed)
uvicorn app.main:app --reload --port 8010

# 3. Frontend (new terminal)
cd frontend
npm install
npm run dev                                                # http://localhost:3000
```

**No Docker?** Set `DATABASE_URL=sqlite:///./geobite_dev.db` in `backend/.env`. Everything works; spatial queries fall back to Python haversine instead of PostGIS `ST_DWithin`/`ST_Contains`.

**Port note:** the API runs on **8010** so it doesn't clash with other services on 8000. To change it, set `API_INTERNAL_URL` for the frontend.

## Demo accounts

All accounts use the password **`GeoBite#2026`**.

| Role | Email | Lands on |
|---|---|---|
| Super administrator | `admin@geobite.demo` | `/console` |
| Medical administrator | `medical.admin@geobite.demo` | `/console` |
| Hospital staff (Chennai GMCH) | `hospital.chennai@geobite.demo` | `/hospital` |
| Hospital staff (Salem) | `hospital.salem@geobite.demo` | `/hospital` |
| Hospital staff (Madurai) | `hospital.madurai@geobite.demo` | `/hospital` |
| Veterinary officer (Chennai) | `vet.chennai@geobite.demo` | `/console` (Chennai scope) |
| Veterinary officer (Madurai) | `vet.madurai@geobite.demo` | `/console` (Madurai scope) |
| Veterinary officer (state) | `vet.state@geobite.demo` | `/console` |
| Municipal officer (Chennai) | `municipal.chennai@geobite.demo` | `/console` |
| Municipal officer (Tiruchirappalli) | `municipal.trichy@geobite.demo` | `/console` |
| Community reporter | `citizen@geobite.demo` | `/community` |

New hospital staff can self-register at `/register` with a **facility access code** (e.g. `DEMO-CHN-01`; the full list is printed by `seed.py`). Community members can report without an account.

## Conference demonstration script

**Demo 1: Hospital**
1. Sign in as `hospital.chennai@geobite.demo`. The hospital dashboard shows the facility's KPIs, map, trend and distributions.
2. Open **New bite incident**. Pick Chennai, then click the map; district, municipality and ward fill in automatically.
3. Complete sections B and C, then submit. An incident ID (`GB-BI-2026-XXXXXX`) is generated.
4. The record appears in the **Incident register**; open it, use **Correct record** and note the audit trail.
5. Open **GIS incident map**: the new incident appears as a point and in the KDE heat surface.

**Demo 2: Community** (works well on a phone)
1. Open `/community/report` while signed out.
2. Use GPS or tap the map, enter a dog count, select behaviours such as *Dogs chasing pedestrians*, and optionally attach a photo.
3. Submit to get a report ID (`GB-CR-XXXXXXXX`), then open **Track status**.
4. The observation appears on the community map, aggregated to a ~500 m cell.

**Demo 3: Administrator**
1. Sign in as `medical.admin@geobite.demo`. The intelligence dashboard shows six KPIs, trends, open alerts and the ward table with Gi*.
2. Filter by **District > Ward** and watch every figure recompute.
3. **GIS map**: toggle the bite heatmap, DBSCAN clusters, dog observations, behaviour, vaccination and One Health layers. Pick *Chennai* to zoom in.
4. **Verification queue**: review the highest-priority reports and their reasons, photo and duplicate group, then verify one.
5. **Alerts**: open *Repeated concerning-behaviour reports - Simmakkal* and assign it to Dr. Anitha Selvam (Madurai vet).
6. Sign in as `vet.madurai@geobite.demo`, record an inspection (*Reports confirmed*) and add an *Anti-rabies vaccination drive*. The alert moves to *Intervention assigned*.
7. Mark the intervention completed (status moves to *Action completed*), then sign in as an admin and close the alert with notes.
8. **Hotspots & AI models**: re-run the hotspot analysis and retrain the risk model (outputs are labelled SIMULATED).

## Folder structure

```
DOG/
├── docker-compose.yml           PostGIS + API + web
├── .env.example                 environment template
├── docs/
│   ├── API.md                   REST endpoint reference (generated from OpenAPI)
│   ├── ARCHITECTURE.md          architecture, database schema, data flow
│   ├── AI_MODULES.md            spatial statistics, index, risk model, YOLO
│   ├── SECURITY_ETHICS.md       privacy, RBAC, data protection
│   └── DEPLOYMENT.md            production deployment, migrations, operations
├── backend/                     FastAPI service
│   ├── app/
│   │   ├── main.py              app, middleware, error handling
│   │   ├── config.py            environment settings
│   │   ├── models.py            SQLAlchemy models (14+ tables)
│   │   ├── schemas.py           Pydantic validation
│   │   ├── vocab.py             controlled vocabularies (one source of truth)
│   │   ├── security.py, deps.py, ratelimit.py
│   │   ├── routers/             auth, meta, hospital, community, map, dashboard, analytics, alerts, vaccination, admin
│   │   ├── services/            hotspot (KDE/DBSCAN/Gi*/index), aggregates, community (dedup+priority),
│   │   │                        alerts_engine, risk_model, vision (YOLO), geo, audit
│   │   └── maintenance.py       data-retention purge job
│   ├── alembic/versions/        0001 schema, 0002 PostGIS geometry + triggers + GIST indexes
│   ├── seed.py                  synthetic Tamil Nadu data
│   └── tests/                   API workflow + spatial statistics tests
└── frontend/                    Next.js 16 + TypeScript + Tailwind 4
    └── src/
        ├── app/                 / (landing), login, register, hospital/*, community/*, console/*
        ├── components/          AppShell, FilterBar, BiteForm, charts, ui, map/* (Leaflet)
        └── lib/                 api client, auth context, hooks, formatting
```

## Testing

```bash
cd backend
pytest -q                                                   # SQLite (fast, no Docker)
TEST_DATABASE_URL=postgresql+psycopg://geobite:geobite_dev_password@localhost:5433/geobite_test pytest -q   # PostGIS
#   (create once: docker compose exec db psql -U geobite -c "CREATE DATABASE geobite_test")

cd ../frontend
npx tsc --noEmit && npm run lint && npm run build
```

The backend suite (14 tests) covers all three demo workflows end to end through the HTTP API:
- registration with facility codes, incident submission, dashboard updates and GIS appearance;
- correction with optimistic locking and an audit diff;
- facility scoping, RBAC denial for each role, and anonymous 401s;
- community submission with photo, status tracking, duplicate rejection, honeypot, consent, service-area validation and rate limiting;
- de-duplication (median, never sum) and privacy of public layers (grid snapping, small-cell suppression);
- district and ward filtering, all five map layers, hotspot run and risk-model training;
- the full alert lifecycle, including an invalid transition, humane-only interventions, closure notes, the audit trail and notifications;
- unit tests for DBSCAN, KDE, Getis-Ord Gi* and the One Health index.

## Configuration

See [`.env.example`](.env.example). In production, `JWT_SECRET` must be set or the API refuses to start.

## Documentation

- [API reference](docs/API.md) (also live at `/api/docs`)
- [Architecture and database schema](docs/ARCHITECTURE.md)
- [AI and spatial-statistics modules](docs/AI_MODULES.md)
- [Security, privacy and ethics](docs/SECURITY_ETHICS.md)
- [Deployment](docs/DEPLOYMENT.md)
