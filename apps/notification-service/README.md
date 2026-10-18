# notification-service  (port 3006, schema `notifications_service`)

**Purpose:** turns events into in-app notifications and e-mails. It is the single place that decides *in-app vs e-mail* (contract §7).
It writes a `Notification` row, queues the e-mail the policy asks for, and publishes `notification.created` so the websocket-gateway pushes it live.
It also exposes the notification bell API and deletes expired rows every day.

## Routes (nginx `/notifications/` -> `:3006`)
Any role (JWT), own rows only.

| Method | Path | Notes |
|---|---|---|
| GET | `/notifications?limit=20&cursor=<id>&unread=1` | `{ items, nextCursor }`, newest first. `limit` 1-50 (default 20); `cursor` = `nextCursor` of the previous page |
| GET | `/notifications/unread-count` | `{ count }` |
| PATCH | `/notifications/:id/read` | the notification; 404 if it is not yours; reading twice keeps the first `readAt` |
| PATCH | `/notifications/read-all` | `{ updated }` |
| GET | `/health` | `200 {status:"ok"}` or `503 {status:"degraded"}` (database / Redis down) |

`Notification` = `{ id, type, title, body, data, readAt, createdAt }`. Expired rows are never returned.

## E-mails (BullMQ queue `email-queue`)
Exactly four types are sent; every other job name is logged and dropped.

| Job | Producer | Recipient | Mail |
|---|---|---|---|
| `password-reset` | auth-service | `email` in the job | reset link (15 min); with `invite: true` an "set your password" mail (7 days) |
| `eligibility-result` | this service | applicant | eligible for `roleTitle` |
| `candidate-ready` | this service | company | applicant name, role, score |
| `shortlisted` | this service | applicant | company, role and the shortlist fields exactly as the company typed them (HTML-escaped) |

Recipients of the last three are resolved with `GET auth-service /internal/users/:id/email` (header `x-internal-key`).
A user that no longer exists (404) is not retried; other errors are retried 5 times with back-off.

## Events
- **Consumes** (consumer group `notification-group`, retry, `XAUTOCLAIM`, dead-letter `<stream>.dead`): `resume.parsed`, `jd.extracted`, `match.computed`, `feedback.ready`, `candidate.ready`, `candidate.shortlisted`, `prep.ready`, `candidate.rejected`, `rejection-feedback.ready`, `company.status.changed`, `job.approval.changed`.
- **Produces:** `notification.created` `{ userId, notification, requestId }`.

## Database
Schema `notifications_service`, table `Notification` (`userId + dedupeKey` unique, `expiresAt` = created + 90 days).
Daily job (`CLEANUP_*`) deletes rows whose `expiresAt` has passed, in batches, under a Redis lock so several instances do not clash.

## Environment variables
| Name | Required | Example | Meaning |
|---|---|---|---|
| `PORT` | no | `3006` | HTTP port |
| `DATABASE_URL` | yes | `postgresql://user:password@localhost:5432/career_matching` | PostgreSQL |
| `REDIS_URL` | yes | `redis://localhost:6379` | Streams + BullMQ |
| `JWT_SECRET` | yes | `change-me` | same value in every service |
| `INTERNAL_API_KEY` | no (yes in prod) | `change-me` | sent as `x-internal-key` to auth-service |
| `AUTH_SERVICE_URL` | yes | `http://localhost:3001` | e-mail lookup |
| `WEB_URL` | yes | `http://localhost:3000` | base of the links inside e-mails |
| `EMAIL_PROVIDER` | yes | `gmail` or `resend` | transport |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `GMAIL_FROM_NAME` | gmail only | | Gmail SMTP |
| `RESEND_API_KEY`, `EMAIL_FROM` | resend only | | Resend |
| `EMAIL_DEV_REDIRECT_TO` | no | `you@example.com` | send ALL mail to one inbox |
| `CLEANUP_ENABLED` / `CLEANUP_INTERVAL_HOURS` / `CLEANUP_BATCH_SIZE` | no | `true` / `24` / `1000` | daily clean-up |
| `ENABLE_DOCS` | no | `false` | Swagger at `/docs` |
| `LOG_LEVEL` | no | `info` | JSON logs (`requestId` included) |

## Run locally
```bash
cp .env.example .env
pnpm --filter notification-service exec prisma generate
pnpm --filter notification-service db:push
pnpm --filter notification-service start:dev
```
Reset the schema: `pnpm --filter notification-service db:reset`.

## Test
`pnpm --filter notification-service test` (unit + HTTP API tests, no database or Redis needed).

## Depends on
PostgreSQL, Redis, auth-service (e-mail lookup). Producers of the events above must be running for notifications to appear.