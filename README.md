# Career Matching Platform

An AI-assisted hiring platform for tech roles (fresher and experienced). Applicants upload a resume for a target role, companies upload requirement documents, and a deterministic matching engine decides who is eligible for which role. Applicants decide whether a company may see their resume; companies shortlist or reject; applicants receive AI guidance either way.

## Features

**Applicants**
- Upload up to 5 resumes, each for a target role (track + stack, e.g. *Backend · Java*); review and confirm the parsed data before any matching starts. Accepted files: PDF, DOCX, TXT, JPG/JPEG, PNG, BMP, TIFF, WEBP (max 10 MB; old `.doc` is not supported, save it as DOCX or PDF).
- See matches with matched and missing skills; approve sharing a resume with a company. Close-but-not-confirmed results show as **Possible match**: you may still share your resume, the company then reviews it themselves.
- Get shortlist details with an AI interview-prep guide, or specific improvement feedback after a rejection.
- AI career assistant and live notifications.

**Companies**
- Upload requirement documents (same file formats as resumes; one file can describe several roles); edit roles and rules (level, experience range min/max with an optional "reject below minimum", track, stacks, CGPA, branch, passing year, backlogs).
- See only approved candidates (eligible ones first, then *Possible matches* that need your own review), download the resume PDF, shortlist with a form or reject with a reason.
- AI assistant that explains the dashboard.

**Accounts and login**
- Two-factor authentication with an authenticator app (Google Authenticator, Authy, Microsoft Authenticator) and one-time recovery codes; admins can reset it for a locked-out user.
- Optional "Continue with Google" (open registration only: it is switched off automatically in college mode).
- Login never says whether an email exists; failed logins and sign-ups are rate limited.

**Admins**
- Registration mode (`open`, `domain`, `invite_only`), company approval and job-posting approval switches.
- CSV user import with invite emails, user and company management, audit log, system health (streams, dead letters).

- Optional e-mail verification for self-signup (admin setting, on by default): the account is created and the profile appears only after the user clicks the mailed link.
- Admins can be required to use two-factor (admin setting); an admin without it is guided through setup at login.

## How matching works

1. A resume is parsed, but **not matched** until the applicant confirms it.
2. A company uploads a requirement document; roles and requirements are extracted and can be edited.
3. The matching agent applies a **target-role gate** (track + stack, in SQL), then scores the pair with a small logistic model on semantic features (MiniLM embeddings), then applies **campus rules** as hard gates. **No LLM takes part in the decision**: it is explainable, repeatable and immune to prompt injection inside resumes.
4. Unknown academic values never fail a candidate; they are flagged as unverified.
5. The result is a **verdict**: `eligible`, `review` (a *possible match*: just below the bar, inside a narrow band) or `not_eligible`. Hard gates (campus rules, strict minimum experience) can never produce `review`. The company sets an experience range per role (min, optional max, optional strict minimum); a candidate over the max is rejected, below the min is rejected when strict, otherwise only a big shortfall counts. Unknown experience is flagged, never rejected. Internships do not count as work experience.
6. Applicants with an `eligible` or `review` verdict may approve sharing; only then does the company see the resume. An approved resume is frozen for that match.
7. Matching is efficient by design: best-first batches, early stop, skip of unchanged pairs (`inputHash`), in-process caches.

## Architecture

```
Next.js ──> Nginx ──> 8 NestJS services ──┐
                                          ├── Redis Streams / BullMQ ──> 5 FastAPI agents
PostgreSQL (schema per service, pgvector) ┘
Cloudinary (files) · Groq (LLM, parser / JD / feedback / chatbot agents only) · Gmail or Resend (email)
```

Services talk to agents only through Redis Streams (chat-service calls chatbot-agent over HTTP). Agents are never exposed by Nginx and `/internal/` is blocked.

| App | Port | Purpose |
|---|---|---|
| web | 3000 | Next.js frontend |
| auth-service | 3001 | accounts, JWT, registration mode, admin settings |
| user-service | 3002 | profiles, admin lists, company approval, audit |
| resume-service | 3003 | resume upload, parsed data, target roles, storage cleanup |
| job-service | 3004 | JD upload, roles, stop/reopen, posting approval |
| matching-results-service | 3005 | matches, consent, decisions, stats |
| notification-service | 3006 | in-app notifications and emails |
| websocket-gateway | 3007 | live events (socket.io) |
| chat-service | 3008 | chat storage and rate limits |
| resume-parser-agent | 8001 | resume to structured data, resume PDFs |
| jd-extractor-agent | 8002 | job description to roles and requirements |
| matching-agent | 8003 | eligibility scoring |
| feedback-agent | 8004 | improvement, prep and rejection guidance |
| chatbot-agent | 8005 | AI assistant |

Each app has its own `README.md` with routes, events and environment variables.

## Tech stack

Next.js 16, React 19, Tailwind 4, Zustand, React Query, socket.io · NestJS, Prisma 7 · FastAPI, sentence-transformers (all-MiniLM-L6-v2), pgvector · PostgreSQL, Redis · Nginx · pnpm workspaces · GitHub Actions.

## Run with Docker (recommended)

Needs Docker with Compose 2.23.1+ (about 8 GB RAM), a Cloudinary account and a Groq API key. The first build is slow (embedding model download, Tesseract and LibreOffice for the parser).

1. Create the env file and fill it in (`cp .env.compose.example .env.compose`; Windows: `copy .env.compose.example .env.compose`).
   Generate secrets with `openssl rand -hex 32` (`JWT_SECRET`, `JWT_REFRESH_SECRET` and `INTERNAL_API_KEY` must differ). `ADMIN_PASSWORD` needs at least 12 characters.
2. `docker compose --env-file .env.compose up --build`
3. Open http://localhost and sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD` (created on first start).

Useful commands:

| Task | Command |
|---|---|
| Container health | `docker compose --env-file .env.compose ps` |
| Logs of one service | `docker compose --env-file .env.compose logs -f <service>` |
| Rebuild one service | `docker compose --env-file .env.compose up -d --build <service>` |
| Stop | `docker compose --env-file .env.compose down` |
| Stop and wipe all data | `docker compose --env-file .env.compose down -v` |
| End-to-end suite | `docker compose --env-file .env.compose --profile e2e run --rm e2e` |

Notes: every service applies its own schema on start; only Nginx publishes a port (set `HTTP_PORT` and `PUBLIC_URL` if 80 is busy; `PUBLIC_URL` is baked into the web build, so rebuild after changing it). Set `EMAIL_DEV_REDIRECT_TO` to your own address in development so every email goes to you.

## Run locally (without Docker for the apps)

Prerequisites: Node 22.12+, pnpm 10, Python 3.11+, PostgreSQL 15+ with pgvector, Redis, Tesseract OCR, LibreOffice, Nginx.

1. `pnpm install` at the repo root.
2. Copy each app's `.env.example` to `.env` (`apps/web`: `.env.local`). Use the same `JWT_SECRET`, `INTERNAL_API_KEY`, `DATABASE_URL` and `REDIS_URL` everywhere; set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `apps/auth-service/.env`.
3. In PostgreSQL run `CREATE EXTENSION vector;` once. Start Redis.
4. For each NestJS service with Prisma: `pnpm --filter <service> exec prisma generate` (user-service: add `--config prisma7.config.ts`), then `pnpm --filter <service> run db:push`.
5. Create the admin: `pnpm seed`.
6. Start each service in its own terminal: `pnpm --filter <service> start:dev`, and `pnpm --filter web dev`.
7. For each agent: `python -m venv .venv`, activate it, `pip install -r requirements.txt`, `uvicorn app.main:app --port <port>`.
8. Start Nginx with `infra/nginx/nginx.conf` (it forwards to `host.docker.internal`; for a native install replace that with `127.0.0.1`).
9. Open http://localhost:3000 (`NEXT_PUBLIC_API_URL=http://localhost`).

Fresh database: stop all services, `pnpm db:reset:all`, start them again.

## Training the matching model

The scorer is a small logistic model on top of pre-trained MiniLM embeddings. Training runs on your machine, not in Docker:

```bash
cd apps/matching-agent
pip install -r requirements.txt -r requirements-train.txt
# set GROQ_API_KEY in the shell (used only to parse the training texts)
python -m training.gold.build_gold                                   # 200-pair hand-labelled test set (never trained on)
python -m training.build_real_dataset                                # Hugging Face dataset, tech only, cached and resumable
python -m training.train --real training/data/real_pairs.jsonl --beta 0.5   # writes app/artifacts/scorer.json
python -m training.evaluate --data training/data/real_pairs.jsonl --beta 0.5
```

Commit `app/artifacts/scorer.json` and the model card; `training/data/` stays git-ignored. Details: `apps/matching-agent/training/README.md`.

## Testing and CI

| What | Command | Workflow |
|---|---|---|
| NestJS build and unit tests | `pnpm --filter <service> run build` / `run test` | `ci-node-services.yml` |
| Python agents | `EMBEDDING_BACKEND=hash python -m unittest discover -s tests -t .` (inside the agent) | `ci-python-agents.yml` |
| Web lint and build | `pnpm --filter web run lint` / `run build` | `ci-web.yml` |
| Taxonomy copies identical | `python -m scripts.check_taxonomy --root ../..` (inside `apps/matching-agent`) | `ci-taxonomy.yml` |
| Compose file and images | `docker compose config`, image builds | `ci-compose.yml` |
| End-to-end (15 checkpoints) | `pnpm e2e` (needs the full stack) | `ci-e2e.yml` |
| Secrets | gitleaks | `secret-scan.yml` |

See `e2e/README.md` for what the end-to-end suite covers.

## Security notes

- Roles in the JWT: `APPLICANT`, `COMPANY`, `ADMIN`.
- Service-to-service calls carry `x-internal-key` (`INTERNAL_API_KEY`); Nginx returns 404 for `/internal/`.
- Applicants never receive recruiter-only fields (`rejectReason`, `decidedBy`, scoring breakdown); companies only see candidates who approved sharing.
- Never commit `.env` files; the `Secret Scan` workflow checks every push.
- Browser access (CORS): every API only answers browsers from `WEB_URL` (comma separated for several). If `WEB_URL` is not set, any origin is allowed (local development only). `docker-compose.yml` sets it from `PUBLIC_URL`.
- Nginx limits requests per IP on `/auth/` (20/s, burst 40) and `/chat/` (5/s, burst 10) and answers 429 beyond that; the real login and sign-up limits live in auth-service.
- The web app sends `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy` and `Permissions-Policy` headers. There is no CSP yet.
- Tokens are kept in the browser's localStorage (zustand persist). Never render user text as HTML (`dangerouslySetInnerHTML`).
- Logout (and signing in as a different user, or another tab doing either) clears the whole client query cache, so one user never sees the previous user's pages on a shared browser.
- Dependencies: run `pnpm audit --prod` before a release. `pnpm-workspace.yaml` `overrides` pin patched versions of transitive packages (multer, proxy-addr, follow-redirects, sharp, mysql2, source-map-js, fast-uri, deepmerge-ts); remove an override once the parent package ships the fix. Rebuild Docker images with `docker compose build --pull --no-cache` before a release so base-image patches (Node, nginx) come in.
- 2FA secrets are encrypted at rest (`TWO_FACTOR_ENCRYPTION_KEY`, 32 bytes hex). Back this key up like `JWT_SECRET`: if it is lost, every user with 2FA must be reset by an admin.
- Google sign-in verifies the ID token on the server (`GOOGLE_CLIENT_ID`); it is available only while registration is `open`.
- Lost every admin authenticator and recovery code (and no other admin can reset it)? Turn 2FA off for that account directly in the database:
  `UPDATE auth_service."User" SET "twoFactorEnabled" = false, "twoFactorSecret" = NULL WHERE email = '<admin email>';` and `DELETE FROM auth_service."RecoveryCode" WHERE "userId" = (SELECT id FROM auth_service."User" WHERE email = '<admin email>');`. With the setting on, that admin is then sent through setup again at the next login.
- Sign-ups that never click the verification link stay as unverified rows without a profile. They are harmless (they cannot log in) and a new sign-up with the same address replaces them. There is no automatic cleanup yet.

## Before going live

- [ ] Email: sending domain verified (SPF/DKIM) and `EMAIL_FROM` set
- [ ] PostgreSQL: `CREATE EXTENSION vector;` done, every schema present
- [ ] Cloudinary folders and private delivery settings checked
- [ ] Groq key and plan limits sized for your traffic
- [ ] Secrets only in env files; admin password changed after first login
- [ ] Every app answers `GET /health`; `ENABLE_DOCS` is not `true`
- [ ] `WEB_URL` / `PUBLIC_URL` set to the real site address (it is also the CORS allow-list)
- [ ] `pnpm audit --prod` checked and Docker images rebuilt with `--pull --no-cache`
- [ ] Matching: `ELIGIBILITY_THRESHOLD` (0.40) and `REVIEW_BAND_WIDTH` (0.10) set; database backfills run (`matching-results-service/prisma/backfill_verdict.sql`, `job-service/prisma/backfill_fresher_max_experience.sql`)
- [ ] Daily jobs run: resume cleanup, notification expiry
- [ ] `TWO_FACTOR_ENCRYPTION_KEY` generated (`openssl rand -hex 32`) and backed up
- [ ] Google sign-in (optional): OAuth client created, your real domain added under *Authorized JavaScript origins*, consent screen published (not "Testing"), `GOOGLE_CLIENT_ID` set; leave it empty to keep Google off
- [ ] E-mail sending works (`EMAIL_PROVIDER` + credentials): with *Verify email on sign-up* on, nobody can finish signing up without it
- [ ] Turn on *Require two-factor for admins* only after your own admin account has two-factor and its recovery codes are saved

## Google sign-in (optional)

1. Google Cloud Console → new project → *OAuth consent screen* (External, app name, support email).
2. *Credentials → Create credentials → OAuth client ID → Web application*.
3. *Authorized JavaScript origins*: `http://localhost`, `http://localhost:3000` and your real domain. No redirect URI is needed.
4. Put the Client ID in `GOOGLE_CLIENT_ID` (auth-service / `.env.compose`). It is not a secret and no client secret is used. The web app reads it from `GET /auth/registration-mode`, so no web rebuild is needed.
5. While the consent screen is in *Testing*, only the test users you add can sign in. Publish it before launch.

Google sign-in is shown only while the admin setting *Registration mode* is `open`. For a college (`invite_only` or `domain`) it is hidden in the web app and refused by the server, so accounts always come from the admin's import or the allowed domain.

## Documentation

`docs/PROJECT_SPEC.md` (full design) · `docs/CONTRACTS.md` (data, API and event contracts) · `docs/consent-flow.md` · `e2e/README.md` · `apps/matching-agent/training/README.md` · `apps/web/README.md`
