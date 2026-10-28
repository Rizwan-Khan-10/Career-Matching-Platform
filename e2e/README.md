# End-to-end checks (contract section 9)

Vitest + `fetch` through nginx, like the browser. One file per checkpoint in `tests/`; every file makes its own users,
company and data (e-mails look like `e2e-<label>-<run>-<n>@example.com`), so a single file can run alone.

## What must be running

The whole stack, started the normal way: Postgres, Redis, nginx on port 80, all Nest services, the websocket gateway and
the agents (with a working `GROQ_API_KEY`: parsing and matching use the LLM).

## Run

```bash
cp e2e/.env.example e2e/.env        # set ADMIN_EMAIL / ADMIN_PASSWORD (+ E2E_INTERNAL_API_KEY for checkpoint 11)
pnpm install
pnpm e2e                            # all 13 checkpoints, one file at a time (about 10-20 minutes)
pnpm e2e -t "checkpoint 4"          # one checkpoint
pnpm e2e:typecheck
```

Before the run the suite waits for the stack, remembers the admin settings and sets "open signup, no approvals";
afterwards it puts them back.

## Fresh database (checkpoint 15)

```bash
# stop all services first (consumers crash on dropped schemas), then:
pnpm db:reset:all                   # every service's db:reset, then pnpm seed
# start the services again, then:
pnpm e2e -t "checkpoint 13"
```

## Settings (env)

| Variable | Default | Used for |
|---|---|---|
| `E2E_BASE_URL` | `http://localhost` | nginx |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | required | the seeded admin |
| `E2E_REDIS_URL` | `redis://localhost:6379` | reading invite/reset tokens (checkpoint 2) |
| `E2E_MATCHING_AGENT_URL`, `E2E_INTERNAL_API_KEY` | `http://localhost:8003`, empty | checkpoint 11 (skipped without the key) |
| `E2E_WAIT_MS` | `120000` | how long to wait for parsing, matching, notifications |
| `E2E_QUIET_MS` | `10000` | how long to wait before asserting that something did NOT happen |

Checkpoint 14 (two-factor) needs `TWO_FACTOR_ENCRYPTION_KEY` set on auth-service and waits up to ~30 s for the next authenticator time step.
Checkpoint 15 (Google) does not need a real Google token; without `GOOGLE_CLIENT_ID` its last test accepts 503 instead of 401.

Inside docker compose (task 4.13) use `E2E_BASE_URL=http://nginx`, `E2E_REDIS_URL=redis://redis:6379`,
`E2E_MATCHING_AGENT_URL=http://matching-agent:8000`.

## What is not asserted automatically

- **Cloudinary deletion** (checkpoint 6): the suite has no Cloudinary access. It checks the DB row and the API.
  Manually: after a replace, the old original and PDF must be gone from the Cloudinary media library.
- **E-mails** (checkpoints 2, 8): there is no mail catcher. Manually: with `EMAIL_DEV_REDIRECT_TO` set (fallback inbox for test accounts with fake addresses), the invite,
  "candidate ready" and "shortlisted" e-mails arrive there. The in-app notifications are asserted.

## Troubleshooting

- `Timed out ... waiting for: resume ... is parsed` -> resume-parser-agent is not running, or `GROQ_API_KEY` is missing.
- `Timed out ... waiting for: a match for role` -> matching-agent is not running (`GET /health` on port 8003).
- Access tokens live 15 minutes; a single file finishes well inside that.
- Job-service caches the company status for 60 s: checkpoint 1 may take up to 90 s after the approval.s