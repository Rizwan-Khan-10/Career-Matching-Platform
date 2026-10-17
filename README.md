# Career Matching Platform

Multi-agent AI platform that connects applicants and companies for tech jobs (fresher and experienced).
Resumes and job descriptions are parsed by AI agents, a deterministic matching engine decides eligibility,
applicants approve sharing their resume, companies shortlist or reject, and candidates receive AI guidance.

## What it does

**Applicants:** upload a resume for a target role (track + stack), review and confirm what was parsed, get matches against open roles,
approve sharing the resume with a company, see shortlist details and AI prep tips or rejection feedback, chat with an AI career assistant, get live notifications.

**Companies:** upload requirement documents (one file can describe several roles), edit roles and rules (CGPA, branch, passing year, backlogs, level, target track and stacks),
see approved candidates, download the resume PDF, shortlist with a form or reject with a reason, ask an AI assistant about the dashboard.

**Admins:** choose the registration mode (open, domain, invite only), switch company approval on or off, import users from CSV, approve companies and job postings,
manage applicants and companies, watch system health (streams, dead letters) and the audit log.

## How it works

1. The applicant uploads a resume with a target role. It is parsed, but **not matched** until the applicant reviews and confirms it.
2. A company uploads a requirement document; roles and requirements are extracted and can be edited.
3. The matching agent first gates by target role (track + stack), then scores resume against role with a deterministic model and campus rules. No LLM decides eligibility.
4. Eligible applicants approve sharing their resume; only then does the company see them.
5. The company shortlists (form) or rejects (reason). The applicant gets notifications, AI prep tips or AI feedback.

## Architecture

Next.js → Nginx → 8 NestJS services; 5 FastAPI agents talk to services only through Redis Streams (chat-service calls chatbot-agent over HTTP).
PostgreSQL (one schema per service, pgvector), Redis (Streams + BullMQ), Cloudinary (files), Groq (LLM), Resend/Gmail (email).
Full design and diagram: `PROJECT_SPEC.md` (section 4).

## Services and ports

| App | Port | Purpose |
|---|---|---|
| web | 3000 | Next.js frontend |
| auth-service | 3001 | accounts, JWT, registration mode, admin settings |
| user-service | 3002 | profiles, admin lists, company approval |
| resume-service | 3003 | resume upload, parsed data, target roles |
| job-service | 3004 | JD upload, roles, stop/reopen, approval |
| matching-results-service | 3005 | matches, consent, decisions, stats |
| notification-service | 3006 | emails + in-app notifications |
| websocket-gateway | 3007 | live events (socket.io) |
| chat-service | 3008 | chat storage, calls chatbot-agent |
| resume-parser-agent | 8001 | resume to structured data, resume PDFs |
| jd-extractor-agent | 8002 | JD to roles and requirements |
| matching-agent | 8003 | eligibility scoring |
| feedback-agent | 8004 | improvement, prep and rejection guidance |
| chatbot-agent | 8005 | AI assistant |

Nginx listens on 80 and routes to the services; agents are never exposed, and `/internal/` is blocked.

## Prerequisites

Node 20.12+, pnpm 9, Python 3.11+, PostgreSQL with pgvector, Redis, Docker (only to run nginx locally), Tesseract OCR,
LibreOffice (for resume PDFs), a Cloudinary account, a Groq API key.

## Quick start (local)

1. `pnpm install` at the repo root.
2. Copy each app's `.env.example` to `.env` (for `apps/web` copy it to `.env.local`). Use the same `JWT_SECRET` and `INTERNAL_API_KEY` everywhere.
   Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `apps/auth-service/.env`.
3. In PostgreSQL run `CREATE EXTENSION vector;` once. Start Redis.
4. For every NestJS service with Prisma: `pnpm --filter <service> exec prisma generate`, then apply its schema (`pnpm --filter <service> run db:push`, see the service README).
5. Create the admin: `pnpm seed`.
6. Start each NestJS service: `pnpm --filter <service> start:dev`.
7. For every agent (inside its folder): `python -m venv .venv`, `pip install -r requirements.txt`, `uvicorn app.main:app --port <port>` (ports in the table).
8. Start nginx with the repo config. It forwards to the services on your machine (`host.docker.internal`):
   - macOS / Windows: `docker run --rm -p 80:80 -v "<repo>/infra/nginx/nginx.conf:/etc/nginx/nginx.conf:ro" nginx:stable`
   - Linux: add `--add-host=host.docker.internal:host-gateway`
9. Start the frontend: `pnpm --filter web dev`, then open http://localhost:3000 (`NEXT_PUBLIC_API_URL=http://localhost`).

Fresh database at any time: stop all services, `pnpm db:reset:all`, start them again.
Docker for the whole stack: see "Run with Docker" below.

## Run with Docker

One command starts everything: PostgreSQL with pgvector, Redis, the 8 NestJS services, the 5 agents, the web app and nginx.
Only nginx publishes a port (80); everything else stays on the compose network.

Needs Docker with Compose 2.23.1 or newer (about 8 GB RAM for Docker) and Cloudinary + Groq keys.
The first build is slow: the matching agent downloads its embedding model, the parser installs Tesseract and LibreOffice.

1. Create the env file and fill it in:
   - Windows cmd: `copy .env.compose.example .env.compose`
   - macOS / Linux: `cp .env.compose.example .env.compose`
2. `docker compose --env-file .env.compose up --build`
3. Open http://localhost and log in with `ADMIN_EMAIL` / `ADMIN_PASSWORD` (the admin is created on first start, `SEED_ADMIN_ON_BOOT=true`).

Run the 13 e2e checkpoints inside compose (the stack must be up; about 10 to 20 minutes):

```bash
docker compose --env-file .env.compose --profile e2e run --rm e2e
```

Useful: `docker compose --env-file .env.compose ps` (health of every container), `... logs -f <service>`, `... down` (stop), `... down -v` (stop and wipe all data).

Notes:
- Each service applies its own schema when it starts; compose creates the `vector` extension on the first start of an empty database.
- `PUBLIC_URL` is baked into the web bundle: after changing it run `up --build` again. If port 80 is busy set `HTTP_PORT=8080` and `PUBLIC_URL=http://localhost:8080`.
- Email: set `EMAIL_DEV_REDIRECT_TO` to your own address so every mail goes to you. Without a working transport only emails fail, in-app notifications still work.
- The compose file does not run the web mocks (`NEXT_PUBLIC_USE_MOCKS=false`).

## Shared environment

`DATABASE_URL`, `REDIS_URL`, `JWT_SECRET` (+ `JWT_REFRESH_SECRET` in auth-service), `INTERNAL_API_KEY`, `CLOUDINARY_*`, `GROQ_API_KEY`,
`EMAIL_PROVIDER`, `EMAIL_FROM`, `WEB_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`. Each app's README has its full table.

## Roles

`APPLICANT`, `COMPANY`, `ADMIN` (in the JWT). See `PROJECT_SPEC.md`.

## Tests and CI

| What | Command | CI workflow |
|---|---|---|
| NestJS services build | `pnpm --filter <service> run build` (unit tests: `... run test`) | `ci-node-services.yml` |
| Python agents import + unit tests | `EMBEDDING_BACKEND=hash python -m unittest discover -s tests -t .` (inside the agent) | `ci-python-agents.yml` |
| Web lint + build | `pnpm --filter web run lint` / `run build` | `ci-web.yml` |
| Taxonomy copies identical (contract 4.10) | `python -m scripts.check_taxonomy --root ../..` (inside `apps/matching-agent`) | `ci-taxonomy.yml` |
| E2E suite typecheck | `pnpm e2e:typecheck` | `ci-e2e.yml` |
| Secrets | gitleaks | `secret-scan.yml` |
| Integration checkpoints (13) | `pnpm e2e` (needs the whole stack running) | run by Dev 4 after merges |

How to run the e2e suite and what it does not check: `e2e/README.md`.

## Team rules

- One owner per path (`00_TEAM_PLAN_AND_CONTRACTS.md`, section 2). A PR only contains files from its author's paths. Branches: `dev1/...` to `dev4/...`.
- Contracts change only through Dev 4, who updates `00_TEAM_PLAN_AND_CONTRACTS.md` and `PROJECT_SPEC.md` together and tells everyone.
- `pnpm-lock.yaml` conflict: never hand-merge. Take `main`'s lock, run `pnpm install`, commit.
- Merge order: Dev 1's schema changes, then Dev 2 and Dev 3, then Dev 4 removes the web mocks.
- After each merge Dev 4 runs the affected checkpoints (`pnpm e2e -t "checkpoint <n>"`) and tells the owner if one fails:

| Merged | Checkpoints to run |
|---|---|
| auth-service, user-service (registration, company status, admin) | 1, 2, 13 |
| notification-service, websocket-gateway | 8, 10, 12 |
| resume-service | 3, 5, 6, 7 |
| agents (parser, jd-extractor, matching) | 3, 4, 5, 11 |
| matching-results-service, feedback-agent | 7, 8, 9 |
| job-service, chat-service | 1 |

## Before real users (ops checklist)

- [ ] Resend: your own sending domain is verified (SPF/DKIM) and `EMAIL_FROM` is set (the test sender is for testing only)
- [ ] PostgreSQL/Supabase: `CREATE EXTENSION vector;` done, every schema present
- [ ] Cloudinary: folders and private delivery settings checked
- [ ] Groq: key and plan limits decided (many students uploading at once hit free-tier limits)
- [ ] Secrets only in env files, the `Secret Scan` workflow is green
- [ ] Admin password from `ADMIN_EMAIL` / `ADMIN_PASSWORD` changed after the first login
- [ ] Every app answers `GET /health`; `/docs` is off (`ENABLE_DOCS` not `true`) in production
- [ ] Daily jobs are running: resume cleanup, notification expiry (90 days)

## More

Full design: `PROJECT_SPEC.md` · Contracts and ownership: `00_TEAM_PLAN_AND_CONTRACTS.md` · Consent flow: `docs/consent-flow.md` ·
E2E: `e2e/README.md` · Matching training: `apps/matching-agent/training/README.md` · Web: `apps/web/README.md`