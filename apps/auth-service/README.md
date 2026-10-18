# auth-service  (port 3001, schema `auth_service`)

**Purpose:** accounts, login, JWT access/refresh tokens, password reset, registration mode and admin user import.

## Port
`3001` (`PORT`).

## Routes
| Method | Path | Role | Notes |
|---|---|---|---|
| GET | `/auth/registration-mode` | none | current registration mode / settings the signup page needs |
| POST | `/auth/signup` · `/auth/login` · `/auth/refresh` | none | |
| POST | `/auth/logout` | JWT | |
| POST | `/auth/forgot-password` · `/auth/reset-password` | none | reset mail goes through the `email-queue` |
| GET, PUT | `/auth/admin/settings` | ADMIN | registration mode, approval flags, allowed domains |
| POST | `/auth/admin/users/import` | ADMIN | CSV import (users get an invite mail) |
| PATCH | `/auth/admin/users/:id/active` | ADMIN | activate / deactivate |
| DELETE | `/auth/admin/users/:id` | ADMIN | |
| GET | `/internal/users/:id/email` | internal key | used by notification-service |
| GET | `/internal/settings` | internal key | used by other services |
| GET | `/health` | none | `200 {status:"ok"}` or `503 {status:"degraded"}` (database / Redis down) |

`/internal/*` needs the header `x-internal-key` when `INTERNAL_API_KEY` is set. nginx blocks `/internal/` from outside.
Swagger is served at `/docs` only when `ENABLE_DOCS=true`.

## Events / queues
- **Streams:** none consumed, none produced.
- **Queue:** BullMQ `email-queue`, job `password-reset` (also used for invites).

## Database
Schema `auth_service`: tables `User`, `SystemSetting`.

## Environment variables
| Variable | Required | Example | Notes |
|---|---|---|---|
| `PORT` | no | `3001` | |
| `DATABASE_URL` | yes | `postgresql://user:password@localhost:5432/career_matching` | schema `auth_service` |
| `REDIS_URL` | yes | `redis://localhost:6379` | refresh tokens, reset tokens, email queue |
| `JWT_SECRET` | yes | — | same value in every service |
| `JWT_REFRESH_SECRET` | yes | — | auth-service only |
| `INTERNAL_API_KEY` | no (yes in prod) | — | required header `x-internal-key` on `/internal/*` when set |
| `USER_SERVICE_URL` | yes | `http://localhost:3002` | profile creation, audit |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | for seed | — | first admin; password at least 12 characters |
| `SEED_ADMIN_ON_BOOT` | no | `false` | `true` = run the seed when the service starts |
| `ALLOW_DB_RESET` | no | `false` | needed to run `db:reset` when `NODE_ENV=production` |
| `TRUST_PROXY_HOPS` | no | `0` | number of reverse proxies in front (nginx = `1`); needed for the per-IP login lock |
| `ENABLE_DOCS` | no | `false` | `true` = Swagger at `/docs` |
| `LOG_LEVEL` | no | `info` | `error`, `warn`, `info` or `debug`; logs are JSON lines with `requestId` |

## Run locally
```bash
cp .env.example .env
pnpm install
pnpm --filter auth-service exec prisma generate
pnpm --filter auth-service db:push      # apply the schema
pnpm --filter auth-service seed         # create the admin + default settings
pnpm --filter auth-service start:dev
```

## Seed and reset
- `pnpm --filter auth-service seed` creates an `ADMIN` from `ADMIN_EMAIL` / `ADMIN_PASSWORD` **only if no admin exists yet**, and adds the default system settings rows that are missing. It is safe to run any number of times and never logs the password.
- `SEED_ADMIN_ON_BOOT=true` does the same at start-up (used by Docker).
- `pnpm --filter auth-service db:reset` drops and recreates the `auth_service` schema (stop the service first). **After a reset, run `pnpm --filter auth-service seed` again**, otherwise there is no admin to log in with.

## Logs
One JSON line per message: `ts`, `level`, `service`, `requestId`, `msg`. The `requestId` comes from the `x-request-id` header (or is created) and is sent on to user-service. `/health` is not logged.

## Test
`pnpm --filter auth-service test`

## Depends on
PostgreSQL, Redis, user-service (profile creation, audit).