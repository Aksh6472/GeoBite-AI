# Architecture

```
 Browser (desktop / mobile)
   │  same-origin /api/*  (httpOnly JWT cookie, SameSite=Lax)
   ▼
 Next.js 16 (App Router)  ── rewrites /api/* ──►  FastAPI (Uvicorn)
   landing, /hospital, /community, /console        routers ─► services ─► SQLAlchemy 2
   React-Leaflet + OSM tiles, Recharts                         │
                                                               ▼
                                              PostgreSQL 16 + PostGIS 3.4
                                              (geometry columns, GIST indexes, sync triggers)
```

- **One backend and one database for all three portals.** A hospital submission or a community report is immediately part of every query the console and maps run. Nothing is copied between portals.
- **Authorisation happens on the server only.** The Next.js `proxy.ts` merely redirects signed-out users early; every API route checks the role with `require_roles(...)`, and hospital staff are additionally scoped to their own facility.
- **Single vocabulary source.** `backend/app/vocab.py` defines every coded field (injury category, behaviours, alert statuses, humane intervention types, and so on). The frontend loads it from `/api/meta/vocab`, so forms, validation and labels never drift apart.
- **Alerts are evaluated synchronously.** Rules run for the affected ward after each bite or community submission or verification (milliseconds at pilot scale). Bulk evaluation runs via `POST /api/alerts/evaluate` or a scheduler.

## Request flow example: community report

1. `POST /api/community/reports` (multipart: JSON `payload` plus an optional `photo`).
2. Rate limit (10/hour/IP), honeypot check, Pydantic validation (consent, Tamil Nadu bounding box, count consistency, at most 30 days old).
3. Exact-duplicate fingerprint check (same IP hash, location, count, behaviours and minute within 24 h): `409` with the existing ID.
4. The photo is decoded, validated and re-encoded, which strips EXIF metadata including GPS.
5. Ward resolution via PostGIS `ST_Contains` on the ward boundary, falling back to the nearest ward centroid.
6. **De-duplication.** The report joins the observation cluster of the nearest report within 150 m observed within 30 days (PostGIS `ST_DWithin` on geography). Same-submitter repeats within 48 h are flagged `is_probable_duplicate`.
7. **Prioritisation.** A rule-based score orders the review queue, with stored human-readable reasons.
8. **Alert rules.** The ward's alert rules are re-evaluated, and new alerts notify officers in that district.
9. An audit log entry is written and a random, non-enumerable report ID is returned.

## Database schema

All tables have integer primary keys, foreign keys, `created_at`/`updated_at` (UTC, timezone-aware) and CHECK constraints for coded fields. Migrations: `backend/alembic/versions/`.

| Table | Purpose | Key columns / notes |
|---|---|---|
| `roles` | 6 roles | `code` unique |
| `users` | accounts | `email` unique, bcrypt `password_hash`, `role_id`, `hospital_id` (staff), `district_id` (officer scope), `is_active`, `deleted_at` (soft delete) |
| `geographical_locations` | state > district > municipality > ward hierarchy | `level`, `parent_id`, `ward_number`, centroid, `boundary_geojson`, population, area, waste sites, schools, markets. **PostGIS:** `centroid geometry(Point)`, `boundary_geom geometry(Polygon)` + GIST |
| `hospitals` | reporting facilities | `facility_type`, district, coordinates, bcrypt-hashed `registration_code_hash` |
| `bite_incidents` | Portal 1 | `incident_code` unique; incident, location, bite, clinical *status* fields; `version` (optimistic locking); `deleted_at` + `deletion_reason`; **no patient name, phone, address or ID**. **PostGIS:** `geom` + GIST |
| `community_reports` | Portal 2 submissions | `report_code` unique; location and method; `verification_status`; `observation_cluster_id`; `is_probable_duplicate`; `priority_score` + `priority_reasons`; `consent_given`; optional `contact_email` (never public); `ip_hash` (HMAC, purged after 30 days); `content_hash`; `photo_path`. **PostGIS:** `geom` + GIST |
| `dog_observations` | 1:1 with report | total, estimated locality dogs, puppies, adults, injured, ear-notched, grouping |
| `behaviour_observations` | 1:n with report | `category` (unique per report), description |
| `vaccination_records` | drives and surveys | dogs vaccinated, surveyed population, `estimation_method` (documented survey or drive record only), `verification_status` |
| `alerts` | alert workflow | `alert_type`, `severity`, `evidence` (JSONB), `status` (7 stages, CHECK), `assigned_to_id`, `due_date`, `closed_at`, `closure_notes` |
| `veterinary_inspections` | field findings | alert, inspector, counts, `report_outcome`, findings. **PostGIS:** `geom` |
| `intervention_records` | humane actions | `intervention_type` (vaccination, ABC, treatment, waste, awareness, ...), status, dogs vaccinated/sterilised/treated |
| `hotspot_analyses` | analysis and model runs | `analysis_type` (`combined`, `risk_model`), parameters, summary, results (JSONB), `model_version`, `is_simulated` |
| `notifications` | in-app notices | user, title, link, `is_read` |
| `audit_logs` | immutable trail | actor, role, action, entity, `changes` (JSON diff, PII redacted), reason, `ip_hash` |

### PostGIS specifics (migration 0002)
- The `geom` columns are maintained by `BEFORE INSERT/UPDATE` triggers from latitude/longitude, so the ORM stays database-agnostic.
- Ward `boundary_geom` is built from `boundary_geojson` with `ST_GeomFromGeoJSON`.
- GIST indexes on every geometry column.
- Spatial queries used: `ST_DWithin(geom::geography, point, radius)` for de-duplication and corroboration, and `ST_Contains(boundary_geom, point)` for ward assignment.

### Data retention
`python -m app.maintenance purge` (run daily) deletes community photos older than `RETENTION_PHOTO_DAYS` and clears IP hashes older than `RETENTION_IP_HASH_DAYS`. Bite incidents are soft-deleted with a reason, never hard-deleted, to preserve surveillance integrity.

### Synthetic demonstration geography
Ward boundaries are **synthetic hexagons** around approximate locality centroids in Chennai, Salem, Vellore, Madurai and Tiruchirappalli, not official boundaries. Replace them by loading official ward GeoJSON into `geographical_locations.boundary_geojson`; the trigger rebuilds the geometries.
