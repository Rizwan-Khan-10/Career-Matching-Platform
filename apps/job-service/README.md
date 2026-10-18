# job-service

Job postings of companies: the uploaded document, the roles extracted from it (or added by hand), stop / reopen, and the optional
admin approval of postings. Port **3004**, schema `jobs_service`. nginx routes `/jobs/*` here; `/internal/*` is for other services only.

## Run

```bash
pnpm install
cp apps/job-service/.env.example apps/job-service/.env      # fill in the values
pnpm --filter job-service exec prisma generate
pnpm --filter job-service db:push
pnpm --filter job-service start:dev
```

| Command (`pnpm --filter job-service ...`) | What it does |
|---|---|
| `test` | unit tests (Prisma, Redis, Cloudinary and the other services are mocked) |
| `lint` | oxlint |
| `build` | `nest build` (this is what CI runs) |
| `db:push` | `prisma db push` (there is no migrations folder) |
| `db:reset` | drops and recreates **only** the `jobs_service` schema, then `db push`. Stop the service first. Refuses `NODE_ENV=production` unless `ALLOW_DB_RESET=true` |

## Environment

| Variable | Required | Default | Meaning |
|---|---|---|---|
| `DATABASE_URL` | yes | - | Postgres (the service stops at start-up with a clear error when missing) |
| `JWT_SECRET` | yes | - | must be identical in every service |
| `INTERNAL_API_KEY` | in production | unset | sent as `x-internal-key` to other services and required on this service's `/internal/*` routes; unset = check skipped (local dev) |
| `USER_SERVICE_URL` | yes | - | company approval check |
| `AUTH_SERVICE_URL` | yes | - | `GET /internal/settings` for `jobApprovalRequired` |
| `REDIS_URL` | no | `redis://localhost:6379` | Redis for the event streams |
| `PORT` | no | `3004` | HTTP port |
| `CLOUDINARY_*` | yes | - | storage of the job documents |
| `ENABLE_DOCS` | no | `false` | `true` serves Swagger at `/docs` |
| `LOG_LEVEL` | no | `info` | `error`, `warn`, `info` or `debug` |
| `ALLOW_DB_RESET` | no | unset | only for `db:reset` in production |

## HTTP

JWT roles: `COMPANY | ADMIN | APPLICANT`. Errors use Nest's default JSON (`{ statusCode, message, error }`).

| Route | Who | What |
|---|---|---|
| `GET /health` | anyone | `200 {status:"ok"}`, or `503 {status:"degraded"}` when the database or Redis is down |
| `POST /jobs/upload` | approved company | multipart `file`. `403 "Company is not approved yet"` (user-service, cached 60 s), `503` when that cannot be checked. Creates the posting: `approvalStatus` is `approved`, or `pending` when `jobApprovalRequired` is on |
| `GET /jobs/mine` | company | own postings with roles, **`approvalStatus`** and **`approvalNote`** |
| `POST /jobs/:id/stop` · `POST /jobs/:id/reopen` | company | stop / reopen scanning and matching |
| `GET /jobs/:id/roles` · `POST /jobs/:id/roles` · `PATCH /jobs/roles/:roleId` · `DELETE /jobs/roles/:roleId` | company | roles (every requirement key of contract 4.1; `track` / `stacks` are checked against the taxonomy) |
| `GET /jobs/admin/pending` | **admin** | postings waiting for approval, oldest first |
| `PATCH /jobs/admin/:id/approval` | **admin** | `{ approved: boolean, note?: string }` |
| `GET /internal/roles/:id` | internal (`x-internal-key`) | role + `companyId` + requirements |

## Admin approval of postings

`jobApprovalRequired` is an admin setting in auth-service (default off), read through `GET auth-service /internal/settings` and cached for 60 s.
If it cannot be read, uploads answer 503 (nothing is stored): a posting never skips the approval by accident.

```
upload ── jobApprovalRequired = false ─▶ approvalStatus "approved" ─▶ jd.uploaded  (document is scanned)
       └─ jobApprovalRequired = true  ─▶ approvalStatus "pending"  ─▶ nothing is published
admin PATCH approved:true  ─▶ "approved" ─▶ jd.uploaded (if never scanned) + jd.extracted (roles that already exist) + job.approval.changed
admin PATCH approved:false ─▶ "rejected" (+ note) ─▶ job.approval.changed
```
- A posting that is `pending` or `rejected` is **never scanned or matched**: no `jd.uploaded`, and adding / editing roles or reopening it publishes
  no `jd.extracted`. Roles can still be prepared; they are matched once the posting is approved.
- The events of one decision are written in **one Redis transaction**. If it fails the decision is rolled back (503), so pressing the button again is safe.
- The same decision twice is a no-op (no second event). An approved posting cannot be rejected (409): it is live, and the company can stop it.
  A rejected posting can still be approved later.
- A stopped posting that is approved only gets `job.approval.changed`; reopening it starts the processing.
- The admin routes live in their own controller (`jobs-admin.controller.ts`) because `JobsController` is `@Roles('COMPANY')` for the whole class.

## Events

Every payload is JSON in one field `data` with a `requestId`; every `XADD` uses `MAXLEN ~ 10000`.

| Publishes | Payload | When |
|---|---|---|
| `jd.uploaded` | `{ jobPostingId, companyId, fileUrl }` | an approved posting is uploaded / approved / reopened (never scanned) |
| `jd.extracted` | `{ jobPostingId, companyId, roleIds }` | a role of an **approved** posting was added / edited, a posting was approved or reopened |
| `job.approval.changed` | `{ companyId, jobPostingId, status, note? }` | every admin decision (notification-service, websocket-gateway) |
| `job.stopped` | `{ jobPostingId, companyId, roleIds }` | the company stopped a job |
| `job.role.deleted` | `{ roleId, jobPostingId }` | a role was deleted |

This service consumes no streams.

## Ops

- **requestId:** taken from the `x-request-id` header (or created), in every JSON log line, copied into every published event and sent on to
  the internal calls (`x-request-id`).
- **Logs:** one JSON line per message: `ts, level, service, requestId, msg`. No personal data.
- **Internal calls:** `GET user-service /internal/companies/:id/status` and `GET auth-service /internal/settings` send `x-internal-key`.
  `InternalKeyGuard` protects this service's own `/internal/*` routes.
