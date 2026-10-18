# auth-service

Accounts, JWT access/refresh tokens, password reset, registration mode and admin user import. Port `3001`.

## Environment

| Variable | Required | Example | Notes |
|---|---|---|---|
| `PORT` | no | `3001` | |
| `DATABASE_URL` | yes | `postgresql://user:password@localhost:5432/career_matching` | schema `auth_service` |
| `REDIS_URL` | yes | `redis://localhost:6379` | refresh tokens, reset tokens, email queue |
| `JWT_SECRET` | yes | — | same value in every service |
| `JWT_REFRESH_SECRET` | yes | — | auth-service only |
| `INTERNAL_API_KEY` | no | — | required header `x-internal-key` on `/internal/*` when set |
| `USER_SERVICE_URL` | yes | `http://localhost:3002` | profile creation, audit |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | for seed | — | first admin; password at least 12 characters |
| `SEED_ADMIN_ON_BOOT` | no | `false` | `true` = run the seed when the service starts |
| `ALLOW_DB_RESET` | no | `false` | needed to run `db:reset` when `NODE_ENV=production` |

## Run locally
```bash
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

## Test
`pnpm --filter auth-service test`