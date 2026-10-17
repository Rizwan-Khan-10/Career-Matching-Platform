# matching-results-service

Stores the matches the matching-agent computed, the applicant's consent to share a resume, the company's
shortlist / reject decisions, and the numbers for the company and admin dashboards. Port **3005**, schema `matches_service`.
nginx routes `/matches/*` and `/stats/*` here. Flow and rules: [`docs/consent-flow.md`](../../docs/consent-flow.md).

## Run

```bash
pnpm install
cp apps/matching-results-service/.env.example apps/matching-results-service/.env   # fill in the values
pnpm --filter matching-results-service exec prisma generate
pnpm --filter matching-results-service db:push
pnpm --filter matching-results-service start:dev
```

| Command (`pnpm --filter matching-results-service ...`) | What it does |
|---|---|
| `test` | unit tests (Prisma, Redis and JWT are mocked) |
| `lint` | oxlint |
| `build` | `nest build` (this is what CI runs) |
| `db:push` | `prisma db push` (there is no migrations folder) |
| `db:reset` | drops and recreates **only** the `matches_service` schema, then `db push`. Stop the service first. Refuses `NODE_ENV=production` unless `ALLOW_DB_RESET=true` |

## Environment

| Variable | Required | Default | Meaning |
|---|---|---|---|
| `DATABASE_URL` | yes | - | Postgres connection string (the service stops at start-up with a clear error when missing) |
| `JWT_SECRET` | yes | - | must be identical in every service |
| `REDIS_URL` | no | `redis://localhost:6379` | Redis for the event streams |
| `PORT` | no | `3005` | HTTP port |
| `INTERNAL_API_KEY` | no | unset | expected in header `x-internal-key` on `/internal/*` routes; unset = check skipped |
| `ENABLE_DOCS` | no | `false` | `true` serves Swagger at `/docs` |
| `LOG_LEVEL` | no | `info` | `error`, `warn`, `info` or `debug` |
| `ALLOW_DB_RESET` | no | unset | only for `db:reset` in production |

## HTTP

JWT roles: `APPLICANT | COMPANY | ADMIN`. Errors use Nest's default JSON (`{ statusCode, message, error }`).

| Route | Who | What |
|---|---|---|
| `GET /health` | anyone | `200 {status:"ok"}`, or `503 {status:"degraded"}` when the database, Redis or a stream consumer loop is down |
| `GET /matches/mine` | applicant | own matches with company, `outcome`, `shortlistInfo`, `prepGuide`, `rejectionMessage`, `rejectionFeedback`, `unverifiedRules`, `resumeId`, `resumeTargetLabel`. Never `rejectReason`, `decidedBy` or `breakdown` |
| `PATCH /matches/:id/approval` | applicant | `{ approved: true \| false }`: consent to share the resume (approval cannot be undone) |
| `GET /matches/role/:jobRoleId` | company (own role) / admin | approved candidates only, with decision data and `resumeTargetLabel` |
| `PATCH /matches/:id/decision` | company | shortlist form, reject form, or `{ decision: null }` to clear (contract 5.6) |
| `GET /stats/company` | company | own funnel: scanned, matched, applied, shortlisted, rejected, per role |
| `GET /stats/admin` | admin | platform totals, by company, by role, `byBranch` |

## Events

Every payload is JSON in one field `data` with an optional `requestId`. Consumer group: `matching-results-group`.

| Consumes | Effect |
|---|---|
| `match.computed` | upsert the match (replacement rule, contract 5.6) |
| `match.scanned` | upsert `RoleScan` rows (dashboard numbers) |
| `feedback.ready` | improvement guide for a not-eligible match |
| `resume.pdf.ready` / `resume.pdf.failed` | `resumeStatus` ready / failed; publishes `candidate.ready` |
| `resume.superseded` / `resume.deleted` | delete the non-approved matches and all scans of that resume |
| `job.role.deleted` | delete the role's matches and scans |
| `prep.ready` | `prepGuide` of a shortlisted match |
| `rejection-feedback.ready` | `rejectionFeedback` of a rejected match (`null` = nothing stored) |

| Publishes | When |
|---|---|
| `match.approved` | applicant approved sharing |
| `candidate.ready` | the PDF of an approved match is ready |
| `candidate.shortlisted` / `candidate.rejected` | company decision (rolled back if the event cannot be published) |

## Reliability

- **Trimming:** every `XADD` uses `MAXLEN ~ 10000` (`src/common/events.ts`).
- **requestId:** taken from the `x-request-id` header or the consumed event, or created. It is in every log line and copied into every event published because of it.
- **Consumers:** each message is retried 3 times with back-off, then goes to `<stream>.dead` (`origId, error, data`) and is acknowledged. Messages that stay pending for 60 s (a crashed consumer) are taken over with `XAUTOCLAIM` every 30 s and go through the same retry and dead-letter path. Handlers are idempotent, so a redelivery is harmless.
- **Health:** a consumer loop that has not completed a read for 30 s makes `/health` answer 503.
- **Logs:** one JSON line per message: `ts, level, service, requestId, msg`. No personal data.
- **Internal routes:** `InternalKeyGuard` (`src/common/internal-key.guard.ts`) is ready for any future `/internal/*` handler.
- **Docs:** set `ENABLE_DOCS=true` and open `/docs`.
