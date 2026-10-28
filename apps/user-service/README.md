# user-service  (port 3002, schema `users_service`)

**Purpose:** applicant and company profiles, avatars (Cloudinary), academic fields, admin lists, company approval and the audit log.

## Port
`3002` (`PORT`).

## Routes
| Method | Path | Role | Notes |
|---|---|---|---|
| GET, PATCH | `/applicants/me` | APPLICANT | own profile incl. academic fields |
| POST | `/applicants/me/avatar` | APPLICANT | image upload |
| POST | `/applicants/summaries` | COMPANY, ADMIN | short profiles for a list of applicant ids |
| GET, PATCH | `/companies/me` | COMPANY | own company profile |
| GET, PUT | `/companies/me/shortlist-defaults` | COMPANY | saved defaults for the shortlist form (private to the company) |
| POST | `/companies/me/avatar` | COMPANY | image upload |
| GET | `/admin/applicants` · `/admin/companies` | ADMIN | lists |
| PATCH | `/admin/companies/:userId/status` | ADMIN | approve / reject a company |
| GET | `/admin/health` | ADMIN | stream backlog / dead-letter sizes |
| GET | `/admin/audit` | ADMIN | latest audit entries (`?limit=`) |
| POST | `/internal/profiles` | internal key | created by auth-service at signup / CSV import |
| POST | `/internal/audit` | internal key | audit entries written by auth-service |
| GET | `/internal/companies/:userId/name` · `/internal/companies/:userId/status` | internal key | used by other services |
| GET | `/health` | none | `200 {status:"ok"}` or `503 {status:"degraded"}` (database / Redis down) |

`/internal/*` needs the header `x-internal-key` when `INTERNAL_API_KEY` is set. nginx blocks `/internal/` from outside.
Swagger is served at `/docs` only when `ENABLE_DOCS=true`.

## Events
- **Consumes:** none.
- **Produces:** `profile.updated` (academic data changed), `company.status.changed`. Every event carries a `requestId`; streams are trimmed with `MAXLEN ~ 10000`.

## Database
Schema `users_service`: tables `ApplicantProfile`, `CompanyProfile`, `AuditLog`.

## Environment variables
| Variable | Required | Example | Meaning |
|---|---|---|---|
| `PORT` | no | `3002` | HTTP port |
| `DATABASE_URL` | yes | `postgresql://user:password@localhost:5432/career_matching` | PostgreSQL |
| `REDIS_URL` | yes | `redis://localhost:6379` | event streams |
| `JWT_SECRET` | yes | `change-me` | same value in every service |
| `INTERNAL_API_KEY` | no (yes in prod) | `change-me` | required header `x-internal-key` on `/internal/*` when set |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | yes | | avatar storage |
| `ENABLE_DOCS` | no | `false` | `true` = Swagger at `/docs` |
| `LOG_LEVEL` | no | `info` | JSON logs (`requestId` included) |
| `ALLOW_DB_RESET` | no | `false` | needed to run `db:reset` when `NODE_ENV=production` |

## Run locally
```bash
cp .env.example .env
pnpm install
pnpm --filter user-service exec prisma generate --config prisma7.config.ts
pnpm --filter user-service db:push
pnpm --filter user-service start:dev
```
Reset the schema: `pnpm --filter user-service db:reset` (stop the service first).

## Logs
One JSON line per message: `ts`, `level`, `service`, `requestId`, `msg`. `requestId` comes from the `x-request-id` header (or is created). `/health` is not logged.

## Test
`pnpm --filter user-service test`

## Depends on
PostgreSQL, Redis, Cloudinary, auth-service (creates the profiles).