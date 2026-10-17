# resume-service  (port 3003, schema `resumes_service`)

## Purpose
Resume upload (Cloudinary) per target role, review/confirm, replace, delete with storage cleanup, and a signed PDF link for companies the applicant approved.

## Routes
| Method path | Role | Notes |
|---|---|---|
| `GET /resumes/target-roles` | any logged-in role | taxonomy with labels |
| `POST /resumes/upload` | APPLICANT | multipart `file`, `targetTrack`, `targetStack`; pdf, docx, txt, jpg, jpeg, png, bmp, tiff, webp; max 10 MB; 409 at 5 non-superseded resumes |
| `GET /resumes/mine` | APPLICANT | adds `targetLabel`, `confirmedAt`, `supersededAt` |
| `PATCH /resumes/:id` | APPLICANT | parsed data (incl. `branch`, `passingYear`, `backlogs`); target role only while unconfirmed |
| `POST /resumes/:id/confirm` | APPLICANT | needs a parsed resume with ≥ 1 skill; replaces the active resume of the same target |
| `DELETE /resumes/:id` | APPLICANT | 409 while an approved match uses it; otherwise removed completely |
| `GET /resumes/:id/pdf` | COMPANY/ADMIN | signed 15-minute link, approved matches only |
| `GET /health` | public | `200 {status:"ok"}`; `503 {status:"degraded"}` when Postgres or Redis is unreachable (Docker HEALTHCHECK) |

## Events
Publishes `resume.uploaded`, `resume.confirmed`, `resume.updated` (confirmed resumes only), `resume.superseded`, `resume.deleted`. Consumes none.

## Database
Schema `resumes_service`, table `Resume`. Reads (never writes) `matches_service.Match` (approved-match check) and the agent-owned `resume_embeddings` table (deletes the row of a removed resume).

## Storage cleanup
- Replace on confirm, `DELETE /resumes/:id` and the daily job use one routine: Cloudinary original **and** generated PDF (private raw files, `invalidate: true`), the `resume_embeddings` row, then the DB row. The row is kept when Cloudinary fails so the job can retry.
- A resume an **approved match** uses is never removed: DELETE answers 409; a replaced one only gets `supersededAt`.
- Daily job (first run 60 s after start, then every `CLEANUP_INTERVAL_HOURS`; a Redis lock keeps multiple instances from running together):
  1. superseded resumes no approved match references any more → removed, `resume.deleted` published;
  2. uploads never confirmed (pending / failed / parsed) created more than `UNCONFIRMED_RESUME_TTL_DAYS` ago → removed.

## Environment variables
| Name | Required | Example | Meaning |
|---|---|---|---|
| `PORT` | no | `3003` | HTTP port |
| `DATABASE_URL` | yes | `postgresql://user:password@localhost:5432/career_matching` | PostgreSQL |
| `REDIS_URL` | yes | `redis://localhost:6379` | Streams + cleanup lock |
| `JWT_SECRET` | yes | `change-me` | same value in every service |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | yes | — | file storage |
| `UNCONFIRMED_RESUME_TTL_DAYS` | no | `14` | age after which an unconfirmed upload is deleted |
| `CLEANUP_ENABLED` | no | `true` | `false` turns the daily job off |
| `CLEANUP_INTERVAL_HOURS` | no | `24` | time between cleanup runs |
| `CLEANUP_BATCH_SIZE` | no | `100` | max resumes handled per category per run |
| `LOG_LEVEL` | no | `info` | JSON logs: `ts, level, service, requestId, msg` (`debug` / `info` / `warn` / `error`) |
| `ENABLE_DOCS` | no | `false` | Swagger UI at `/docs` only when `true` |

## Run locally
```bash
pnpm install
pnpm --filter resume-service exec prisma generate
pnpm --filter resume-service db:push        # apply the schema
pnpm --filter resume-service start:dev
pnpm --filter resume-service db:reset       # drop + recreate this service's schema (stop the service first)
```

## Test
`pnpm --filter resume-service test`

## Depends on
PostgreSQL, Redis, Cloudinary. The tables of `matches_service` must exist for the approved-match check.