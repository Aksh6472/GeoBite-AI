# GeoBite-AI REST API

Base URL: `/api` (proxied by Next.js in the browser; directly at `http://localhost:8010/api` in development).
Interactive documentation: **`/api/docs`** (Swagger UI) and **`/api/redoc`**. The OpenAPI schema is at `/api/openapi.json`.

## Authentication

`POST /api/auth/login` returns a JWT and also sets it as an `httpOnly`, `SameSite=Lax` cookie (`gb_token`). Browser clients rely on the cookie; scripts can send `Authorization: Bearer <token>`.
Validation errors return `422` with `{"detail": [{"field": "...", "msg": "..."}]}`. Rate-limited endpoints return `429` with a `Retry-After` header.

## Common filter parameters

Dashboard, GIS and list endpoints accept: `district_id`, `municipality_id`, `ward_id`, `date_from`, `date_to` (ISO dates), `incident_type` (an injury category such as `cat_iii` or a behaviour such as `chasing_pedestrians`) and `verification_status` (`received`, `under_verification`, `verified`, `rejected`).

## Endpoints

### Auth

Access: public

| Method | Path | Summary |
|---|---|---|
| `POST` | `/api/auth/login` | Login |
| `POST` | `/api/auth/logout` | Logout |
| `POST` | `/api/auth/register` | Register |
| `GET` | `/api/auth/me` | Me - Current session user, or null when signed out (avoids 401 noise for anonymous visitors). |

### Reference

Access: public

| Method | Path | Summary |
|---|---|---|
| `GET` | `/api/meta/vocab` | Vocabularies |
| `GET` | `/api/geo/tree` | Geo Tree |
| `GET` | `/api/geo/locate` | Locate |
| `GET` | `/api/geo/wards` | Ward Boundaries |
| `GET` | `/api/meta/hospitals` | Hospitals |

### Hospital

Access: super_admin, medical_admin, hospital_staff (own facility only)

| Method | Path | Summary |
|---|---|---|
| `POST` | `/api/bite-incidents` | Create Incident |
| `GET` | `/api/bite-incidents` | List Incidents |
| `GET` | `/api/bite-incidents/dashboard` | Hospital Dashboard |
| `GET` | `/api/bite-incidents/export.csv` | Export Csv |
| `GET` | `/api/bite-incidents/{incident_id}` | Get Incident |
| `PUT` | `/api/bite-incidents/{incident_id}` | Update Incident |
| `DELETE` | `/api/bite-incidents/{incident_id}` | Soft Delete |
| `GET` | `/api/bite-incidents/{incident_id}/history` | History |

### Community

Access: public submit / status; moderation: super_admin, medical_admin, veterinary_officer, municipal_officer

| Method | Path | Summary |
|---|---|---|
| `POST` | `/api/community/reports` | Submit Report |
| `GET` | `/api/community/reports` | Moderation Queue |
| `GET` | `/api/community/reports/status/{code}` | Report Status |
| `GET` | `/api/community/my-reports` | My Reports |
| `GET` | `/api/community/dashboard` | Community Dashboard - Public, aggregate-only statistics. |
| `GET` | `/api/community/reports/{report_id}` | Get Report |
| `GET` | `/api/community/reports/{report_id}/photo` | Report Photo |
| `POST` | `/api/community/reports/{report_id}/verify` | Verify Report |
| `GET` | `/api/community/stats/queue` | Queue Counts |

### Gis

Access: see endpoint

| Method | Path | Summary |
|---|---|---|
| `GET` | `/api/map/bites` | Bite Layer |
| `GET` | `/api/map/dogs` | Dog Layer |
| `GET` | `/api/map/behaviour` | Behaviour Layer |
| `GET` | `/api/map/vaccination` | Vaccination Layer |
| `GET` | `/api/map/onehealth` | Onehealth Layer |
| `GET` | `/api/map/public/bites` | Public Bite Summary - Ward-level aggregated bite counts for public dashboards, with small-cell suppression. |

### Dashboard

Access: console roles

| Method | Path | Summary |
|---|---|---|
| `GET` | `/api/dashboard/summary` | Summary |
| `GET` | `/api/dashboard/trends` | Trends |
| `GET` | `/api/dashboard/breakdowns` | Breakdowns |
| `GET` | `/api/dashboard/wards` | Ward Table |

### Analytics

Access: console roles (run/train: admins + veterinary_officer)

| Method | Path | Summary |
|---|---|---|
| `POST` | `/api/analytics/hotspots/run` | Run Hotspots |
| `GET` | `/api/analytics/hotspots/latest` | Latest Hotspots |
| `GET` | `/api/analytics/runs` | List Runs |
| `POST` | `/api/analytics/risk-model/train` | Train Risk |
| `GET` | `/api/analytics/risk-model/latest` | Latest Risk |
| `GET` | `/api/analytics/vision/status` | Vision Status |
| `POST` | `/api/analytics/vision/count` | Vision Count |
| `GET` | `/api/analytics/export/{dataset}.csv` | Export - Aggregated exports (no patient-level or reporter-level identifiers). |

### Alerts

Access: console roles (assign/evaluate: admins; updates: assigned officer or admin)

| Method | Path | Summary |
|---|---|---|
| `GET` | `/api/alerts` | List Alerts |
| `POST` | `/api/alerts` | Create Alert |
| `POST` | `/api/alerts/evaluate` | Run Rules |
| `GET` | `/api/alerts/{alert_id}` | Get Alert |
| `POST` | `/api/alerts/{alert_id}/assign` | Assign |
| `POST` | `/api/alerts/{alert_id}/status` | Set Status |
| `POST` | `/api/alerts/{alert_id}/inspections` | Add Inspection |
| `POST` | `/api/alerts/{alert_id}/interventions` | Add Intervention |
| `PATCH` | `/api/interventions/{intervention_id}` | Update Intervention |
| `GET` | `/api/officers` | Officers |

### Vaccination

Access: console roles (record: super_admin, veterinary_officer, municipal_officer)

| Method | Path | Summary |
|---|---|---|
| `GET` | `/api/vaccination` | List Records |
| `POST` | `/api/vaccination` | Create |
| `POST` | `/api/vaccination/{record_id}/confirm` | Confirm |

### Administration

Access: super_admin (users write), super_admin + medical_admin (read)

| Method | Path | Summary |
|---|---|---|
| `GET` | `/api/admin/users` | List Users |
| `POST` | `/api/admin/users` | Create User |
| `PATCH` | `/api/admin/users/{user_id}` | Update User |
| `GET` | `/api/admin/audit-logs` | Audit Logs |
| `GET` | `/api/notifications` | Notifications |
| `POST` | `/api/notifications/read-all` | Read All |
| `POST` | `/api/notifications/{nid}/read` | Read One |

### System

Access: public

| Method | Path | Summary |
|---|---|---|
| `GET` | `/api/health` | Health |

## Example: submit a community report

```bash
curl -X POST http://localhost:8010/api/community/reports \
  -F 'payload={"district_id":2,"latitude":13.0339,"longitude":80.2619,"location_method":"map","observed_at":"2026-11-09T07:30:00Z","dogs":{"total_dogs":5},"behaviours":[{"category":"chasing_vehicles"}],"consent":true}' \
  -F photo=@dogs.jpg
```

## Example: hospital incident (authenticated)

```bash
TOKEN=$(curl -s -H 'content-type: application/json' -d '{"email":"hospital.chennai@geobite.demo","password":"GeoBite#2026"}' http://localhost:8010/api/auth/login | jq -r .access_token)
curl -H "Authorization: Bearer $TOKEN" 'http://localhost:8010/api/bite-incidents?limit=5'
```
