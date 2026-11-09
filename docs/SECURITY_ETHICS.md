# Security, privacy and ethics

## Data minimisation
- Bite reports **do not collect** patient names, phone numbers, addresses, hospital registration numbers or dates of birth. The patient fields are an age group and, optionally, sex under approved protocols.
- Free-text fields warn users not to include identifiers.
- Community reporters can submit anonymously. An optional email for updates is stored but never returned by any public endpoint.

## Access control (server-side)

| Role | Bite records | Community reports | Console | Alerts |
|---|---|---|---|---|
| Hospital staff | **own facility only** (CRUD with audit) | - | hospital portal + aggregated GIS | - |
| Medical admin | all facilities | review | full | assign, close |
| Super admin | all | review | full + users | assign, close |
| Veterinary officer | aggregated only (heat/clusters) | review / verify | district-scoped | act on assigned |
| Municipal officer | aggregated only | review / verify | district-scoped | act on assigned |
| Community reporter / public | aggregated public layers | own reports' status | - | - |

## Location privacy
- Public map layers snap community data to a ~550 m grid (`PUBLIC_GRID_DEG`) and omit report IDs.
- Public bite summaries are ward-level, and counts below 3 (`PUBLIC_MIN_CELL_COUNT`) are suppressed.
- Individual bite points are returned only to clinical roles.
- Uploaded photos are re-encoded to strip EXIF/GPS metadata and are served only to authorised reviewers.

## Application security
- **Passwords:** bcrypt (cost 12). The login error is generic and timing is equalised with a dummy hash. New passwords need 10+ characters with letters and digits.
- **Sessions:** HS256 JWTs (8 h) in an `httpOnly`, `SameSite=Lax` cookie (`Secure` with `COOKIE_SECURE=true`), so they can't be read by JavaScript. Bearer tokens are supported for scripts.
- **CSRF:** SameSite cookies, JSON bodies, and the same-origin proxy.
- **Rate limits:** login 20/15 min, registration 10/h, community reports 10/h, status lookups 60/h per IP. The in-memory limiter should be swapped for Redis when running several API instances.
- **Spam:** honeypot field, exact-duplicate fingerprinting and probable-duplicate flagging.
- **Validation:** Pydantic schemas with controlled vocabularies, coordinate bounds (Tamil Nadu service area), date logic, and count consistency. Database CHECK constraints are a second line of defence.
- **Integrity:** optimistic locking on incident corrections (`expected_version`), mandatory correction reasons and soft deletes.
- **Audit:** every create, update, verify, assign, status change, inspection, intervention, export, analysis run, login and failed login. Diffs exclude personal identifiers.
- **Hardening:**
  - Security headers: `nosniff`, `X-Frame-Options: DENY` and a referrer policy.
  - Errors return a request ID and never stack traces.
  - Leaflet popups escape their HTML.
  - Upload paths are confined to the upload directory.
- **Secrets:** environment variables only. The API refuses to start in production with the default JWT secret.

## Ethical safeguards built into the product
- No AI diagnosis or treatment recommendation. Clinical fields are reporting statuses only.
- Community observations stay *reported* until verified by authorised personnel. The system never labels a dog as dangerous.
- High dog density is framed as a vaccination/ABC outreach need, not as a risk of danger.
- Intervention types are restricted to humane options (vaccination, ABC, veterinary care, waste management, awareness, rescue). Removal, culling and poisoning are deliberately not representable.
- All demonstration data is synthetic and labelled in the UI and the API (`is_synthetic`, `synthetic_data_present`, `is_simulated`).

## Before using real data
1. Institutional ethics committee approval and data-sharing agreements with each facility.
2. A Data Protection Impact Assessment aligned with India's Digital Personal Data Protection Act 2023.
3. Hosting in an approved environment with encrypted storage, backups and access reviews.
4. Replace the demo facility access codes; rotate `JWT_SECRET` and `IP_HASH_SALT`.
5. Agree retention periods and configure the `maintenance purge` schedule.
