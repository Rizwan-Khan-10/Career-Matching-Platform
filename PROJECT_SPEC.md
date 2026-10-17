# Career Matching Platform — Project Specification

> Version: final consolidated (confirm gate, target roles, storage cleanup, efficient matching included).
> Purpose of this file: a single document that explains **how the whole project is built** — tech stack, architecture,
> every service and agent, how data flows, and how each feature works. It describes the project as designed.
> Markers used throughout: **[exists]** = already implemented in the codebase, **[new]** = agreed design, not built yet.
> Parts that are not marked are implemented. Written from the codebase (`Career-Matching-Platform-main.zip`) plus the
> design decisions made with the project owner.

---

## 1. What the project is

A multi-agent AI platform that connects **applicants** and **companies** (recruiters), focused on **tech jobs** for both
**fresher and experienced** candidates.

- An applicant registers and uploads a resume for a **specific target role** (e.g. Backend · Java); the system extracts structured data from it.
  The applicant reviews it and **confirms** — only a confirmed resume is matched. An applicant may keep several resumes, but only **one active resume per target role**.
- A company uploads a job description (JD); the system extracts one or more **roles** with requirements.
- A matching engine scores confirmed resumes against **compatible** roles only (same track and stack) and decides eligibility.
- The applicant is told which roles they are eligible for and **chooses** whether to share their resume with that company.
- The company sees only the candidates who approved, can shortlist or reject them, and the candidate receives
  preparation guidance (shortlisted) or improvement feedback (rejected).
- Live updates reach users through WebSocket, and an in-app notification centre keeps everything else.
- An admin controls registration, approves companies, and monitors the platform.

It is designed to work for **one institution (a college placement cell)** and equally as an **open platform**
(LinkedIn-style). Behaviour is switched by an admin-controlled registration mode (section 9.1).

### Roles
| Role | What they do |
|---|---|
| `APPLICANT` | registers (or is added by admin), uploads resume, fills profile, reviews matches, approves/declines sharing, reads feedback, chats with the AI assistant |
| `COMPANY` | registers (or is added by admin), uploads JDs, manages roles, sees approved candidates, shortlists/rejects, asks the AI assistant about the dashboard |
| `ADMIN` | controls registration mode, imports users, approves companies, sees platform analytics and system health. Not self-service: admin accounts are created by the system owner |

---

## 2. Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, Zustand (auth store), TanStack React Query, react-hook-form + zod, axios, socket.io-client |
| Backend services | NestJS (8 microservices), Prisma ORM, class-validator, Passport JWT, BullMQ |
| AI agents | Python FastAPI (5 agents), Groq-hosted LLMs, sentence-transformers (`all-MiniLM-L6-v2`, 384-dim), pgvector, scikit-learn-style logistic scorer (custom), pytesseract (OCR), LibreOffice (DOCX→PDF) |
| Gateway | Nginx (reverse proxy, single public entry point) |
| Database | PostgreSQL with pgvector (Supabase). **One database, one schema per service** |
| Events / queues | Redis Streams (service ↔ agent ↔ gateway events), BullMQ on Redis (email queue) |
| Email | Nodemailer + Gmail SMTP in development, Resend in production (`EMAIL_PROVIDER`) |
| File storage | Cloudinary (resumes, JD documents, avatars, generated resume PDFs) |
| Auth | JWT access token (15 min) + refresh token (7 days, stored in Redis) |
| Monorepo | pnpm workspace (`apps/*`) |
| CI | GitHub Actions: node services, python agents, web, secret scan (gitleaks) |

LLMs (Groq): `openai/gpt-oss-120b` for feedback and chatbot agents; configurable `GROQ_MODEL` for the resume and JD
parsers. **The matching decision itself uses no LLM** (section 8).

---

## 3. Repository layout

```
apps/
  web/                        Next.js frontend
  auth-service/               :3001  NestJS
  user-service/               :3002  NestJS
  resume-service/             :3003  NestJS
  job-service/                :3004  NestJS
  matching-results-service/   :3005  NestJS
  notification-service/       :3006  NestJS
  websocket-gateway/          :3007  NestJS + socket.io
  chat-service/               :3008  NestJS
  resume-parser-agent/        FastAPI
  jd-extractor-agent/         FastAPI
  matching-agent/             FastAPI (+ training/ and scripts/)
  feedback-agent/             FastAPI
  chatbot-agent/              FastAPI
infra/nginx/nginx.conf
docs/consent-flow.md
.github/workflows/
```

Conventions used by every NestJS service: `ConfigModule` (env), `PrismaModule`, `RedisModule`, `JwtStrategy` +
`JwtAuthGuard` + `RolesGuard` + `@Roles()` decorator, `ValidationPipe({whitelist, transform})`, `enableCors()`,
`/internal/*` controllers for service-to-service calls only.
Conventions used by every Python agent: `app/main.py` (FastAPI + background consumer thread), `app/core/{config,db,redis_stream,llm_client}.py`,
`app/services/*` (logic), `app/workers/*` (stream handlers), `app/models/*` (pydantic).

---

## 4. Architecture

```
                         ┌────────────────────────┐
  Browser (Next.js) ────▶│        NGINX :80       │   /internal/*  → 404 (never public)
        │                └───────────┬────────────┘
        │ socket.io                  ├─ /auth/*                          → auth-service              :3001
        │                            ├─ /applicants /companies /admin    → user-service              :3002
        │                            ├─ /resumes/*                       → resume-service            :3003
        │                            ├─ /jobs/*                          → job-service               :3004
        │                            ├─ /matches/* /stats/*              → matching-results-service  :3005
        │                            ├─ /notifications/*  [new]          → notification-service      :3006
        │                            ├─ /chat/*                          → chat-service              :3008
        └────────────────────────────┴─ /socket.io/*                     → websocket-gateway         :3007

  Agents are NOT behind nginx. The frontend never calls an agent.
  Only chat-service calls chatbot-agent (HTTP). All other agent traffic is Redis Streams.

        ┌──────────────────────── Redis Streams ────────────────────────┐
        │  services  ⇄  resume-parser · jd-extractor · matching · feedback  agents
        │  websocket-gateway consumes streams to push live events        │
        └────────────────────────────────────────────────────────────────┘
        BullMQ "email-queue":  auth-service / matching-results-service  →  notification-service

        PostgreSQL: auth_service · users_service · resumes_service · jobs_service · matches_service · chat_service
                    (+ notifications_service [new]) and pgvector tables resume_embeddings, job_role_embeddings
```

Rules of the architecture
- Frontend → nginx → services only. Agents are internal.
- Services talk to each other by (a) Redis Streams events, (b) a few `/internal/*` HTTP calls
  (auth→user profile creation, notification→auth email lookup, chat→matching/job lookups).
- Agents and some services also read other services' schemas directly in the same database (e.g. agents read
  `resumes_service.Resume`, `jobs_service.JobRole`; results-service joins `users_service.CompanyProfile`). This is a known,
  accepted shortcut.
- Every consumer uses consumer groups, retries, and a dead-letter stream `<stream>.dead`.
- Every state change that other parts care about is an event on a stream.

---

## 5. NestJS services

### 5.1 auth-service (:3001) — schema `auth_service`
Owns identities and tokens.
- Model `User { id, email (unique), passwordHash (bcrypt), role: ADMIN|COMPANY|APPLICANT }`.
- Routes (public unless noted): `POST /auth/signup` (self-service roles: APPLICANT, COMPANY), `POST /auth/login`,
  `POST /auth/refresh`, `POST /auth/logout` (JWT), `POST /auth/forgot-password`, `POST /auth/reset-password`.
- Login protection: 5 failed attempts per email → 5-minute lock (Redis key `login-attempts:<email>`).
- Refresh token stored in Redis (`refresh:<userId>`, 7 days); reset tokens `reset:<token>` (15 min). A password reset signs out all sessions.
- Signup then calls `user-service POST /internal/profiles` to create the empty profile (same user id).
- Internal: `GET /internal/users/:id/email` (used by notification-service), `GET /internal/settings` [new].
- Produces BullMQ job `password-reset`.
- [new] registration mode, `companyApprovalRequired`, admin user import, activate/deactivate users (section 9).
- [new] **Admin seed:** `pnpm --filter auth-service seed` creates the ADMIN from `ADMIN_EMAIL` / `ADMIN_PASSWORD` only if no admin exists (idempotent) and writes default settings; optional `SEED_ADMIN_ON_BOOT=true`. Every service has a `db:reset` script; after a reset run `seed` (section 9.12).
- [new] Sessions per device (`refresh:<userId>:<sessionId>`); login lock keyed by email + IP plus a higher per-email limit.

### 5.2 user-service (:3002) — schema `users_service`
Owns profiles.
- `ApplicantProfile { userId, name, phone, education, headline, location, linkedinUrl, avatarUrl }`
- `CompanyProfile { userId, name, industry, contact, website, location, description, avatarUrl }`
- Routes: `GET|PATCH /applicants/me`, `POST /applicants/me/avatar`, `POST /applicants/summaries` (company/admin: name lookups, restricted to approved candidates),
  `GET|PATCH /companies/me`, `POST /companies/me/avatar`, `GET /admin/applicants`, `GET /admin/companies` (ADMIN).
- Internal: `POST /internal/profiles`, `GET /internal/companies/:userId/name`.
- [new] academic fields on the applicant profile, company approval status, audit log (section 9, 10).

### 5.3 resume-service (:3003) — schema `resumes_service`
Owns resume files, parsed data, target roles and storage cleanup.
- `Resume { id, applicantId, cloudinaryPublicId, fileUrl, pdfPublicId?, status: pending|parsed|failed, parsedData (JSON),
  targetTrack, targetStack, targetKey, confirmedAt?, supersededAt? }` (`targetKey = track:stack`).
- Routes (APPLICANT unless noted): `GET /resumes/target-roles` (taxonomy, any logged-in role), `POST /resumes/upload` (fields `file`, `targetTrack`, `targetStack`;
  pdf, docx, txt, jpg, jpeg, png, bmp, tiff, webp; max 10 MB; at most 5 non-superseded resumes), `GET /resumes/mine`, `PATCH /resumes/:id` (edit parsed data; target role editable until confirmed),
  `POST /resumes/:id/confirm`, `DELETE /resumes/:id`, `GET /resumes/:id/pdf` (COMPANY/ADMIN; signed 15-min link, only if the applicant approved sharing with that company's role).
- Publishes `resume.uploaded`, `resume.confirmed`, `resume.updated` (confirmed resumes only), `resume.superseded`, `resume.deleted`.
- **Confirm** replaces the active resume with the same `targetKey` in one transaction (section 9.10). **Storage cleanup** is described in section 9.11.

### 5.4 job-service (:3004) — schema `jobs_service`
Owns job postings and roles.
- `JobPosting { id, companyId, fileUrl, status: pending|extracted|failed, errorMessage, stoppedAt }`
- `JobRole { id, jobPostingId, title, requirements (JSON) }` — requirements include `level`, `track`, `stacks[]` and optional campus rules (sections 9.5, 9.10)
- Routes (COMPANY): `POST /jobs/upload`, `GET /jobs/mine`, `POST /jobs/:id/stop`, `POST /jobs/:id/reopen`,
  `GET|POST /jobs/:id/roles`, `PATCH|DELETE /jobs/roles/:roleId`.
- Internal: `GET /internal/roles/:id`.
- Publishes `jd.uploaded`, `jd.extracted` (also for manual role create/edit and reopen), `job.role.deleted`, `job.stopped`.
- Stop/reopen: a stopped posting is not scanned and not matched; applicants cannot approve; reopen re-scans or re-matches.
- [new] company must be approved before posting (section 9.2); optional admin approval of postings (`jobApprovalRequired`).

### 5.5 matching-results-service (:3005) — schema `matches_service`
Stores match results and runs the consent and decision flow.
- `Match { applicantId, jobRoleId, resumeId, score, eligible, reason, matched/partial/missingSkills, breakdown, modelVersion, feedback,
  applicantStatus: pending|approved|declined, approvedAt, resumeStatus: none|ready|failed, resumeSharedAt, decision: shortlisted|rejected|null, decidedAt, decidedBy }` (unique per applicant+role — **one resume per job role**; [new] also stores decision form data, `prepGuide`, `rejectionFeedback`, `unverifiedRules`)
- `RoleScan { jobRoleId, resumeId, applicantId, eligible, score, inputHash }` — one row for every (role, resume) pair the agent evaluated (dashboard numbers; `inputHash` lets matching skip unchanged pairs).
- **Replacement rule:** a new result for an existing (applicant, role) replaces the stored match only if the existing one is **not approved** (an approved match is frozen to the resume the company received) and (same resume, or higher score, or the old resume is no longer active).
  On `resume.superseded` / `resume.deleted` the non-approved matches and all scans of that resume are removed.
- Routes: `GET /matches/mine` (applicant; includes company name), `PATCH /matches/:id/approval` (applicant),
  `GET /matches/role/:jobRoleId` (company; only approved candidates), `PATCH /matches/:id/decision` (company),
  `GET /stats/company`, `GET /stats/admin`.
- Consumes `match.computed`, `match.scanned`, `feedback.ready`, `job.role.deleted`, `resume.pdf.ready`, `resume.pdf.failed`.
  Publishes `match.approved`, `candidate.ready`. [new] No longer enqueues emails (notification-service decides).
- Server-enforced rules: a company sees a match, applicant name or resume **only after** `applicantStatus = approved`; only an eligible match can be approved;
  approving is idempotent and cannot be undone; the company gets exactly the resume the match was computed on.
- Dashboard numbers: Scanned (distinct **applicants** evaluated, even when several resumes were scanned), Matched (eligible), Applied (eligible and approved), Shortlisted (company pressed shortlist).

### 5.6 notification-service (:3006)
Today: a BullMQ worker for queue `email-queue` that sends emails (`eligibility-result`, `feedback-guide`, `candidate-ready`, `password-reset`),
resolving the recipient via `auth-service /internal/users/:id/email`. Transport: Gmail (Nodemailer) or Resend via `EMAIL_PROVIDER`;
`EMAIL_DEV_REDIRECT_TO` sends all dev mail to one inbox. All dynamic text is HTML-escaped.
[new] becomes the single place that decides in-app vs email (section 9.4).

### 5.7 websocket-gateway (:3007)
socket.io server. A client connects with its JWT (`auth.token`); the gateway verifies it and joins the room `user:<id>` (several tabs supported).
It consumes `resume.parsed`, `jd.extracted`, `match.computed`, `feedback.ready`, `candidate.ready` and pushes each event to the room of
`applicantId` (or `companyId` if no applicantId). Pages listen to the events and refetch their data.
[new] also consumes `notification.created`.

### 5.8 chat-service (:3008) — schema `chat_service`
Conversation storage and the only caller of the chatbot agent.
- `ChatConversation { applicantId, jobRoleId, name }` — **one conversation per match**, created lazily from `GET /matches/mine`.
  `ChatMessage { conversationId, sender: user|agent, content }`.
- Routes: `GET /chat/conversations`, `PATCH /chat/conversations/:id` (rename), `GET /chat/conversations/:id/messages`,
  `POST /chat/conversations/:id/messages` (applicant), `POST /chat/quick` (company, no history).
- Sends the last 20 turns plus `userId`, `role`, `jobRoleId` (taken from the verified JWT and conversation owner, never from message text) to `chatbot-agent /chat`.
- Rate limit per user: 10 messages/minute and 200/day (`CHAT_RATE_PER_MINUTE`, `CHAT_RATE_PER_DAY`), in memory.
- Messages are stored only after the agent answers (a failed call leaves nothing behind). Agent failure → HTTP 503 with a friendly message.

---

## 6. Python agents

All agents are FastAPI apps with `GET /health`. Stream consumers run in background threads started from `app/main.py`
(each can be disabled with an `ENABLE_*_CONSUMER=false` env var). Shared consumer behaviour (`app/core/redis_stream.py`):
consumer group, up to 5 messages per read, redelivery of idle pending messages (`XAUTOCLAIM`), max deliveries then dead-letter to `<stream>.dead`,
optional `on_dead` callback so the user-facing status never stays "pending" forever.

### 6.1 resume-parser-agent
- Consumes `resume.uploaded`: downloads the file, extracts text (PDF via PyMuPDF/pypdf, DOCX via python-docx/docx2txt, TXT, images via Tesseract OCR),
  asks the Groq LLM for structured JSON, validates it with pydantic, computes `experienceYears` from dates, stores `parsedData` and a 384-dim embedding
  (`resume_embeddings`) built from the **structured profile text**, then publishes `resume.parsed`. [new] `resume.parsed` only tells the UI that the resume is ready to **review and confirm**; it no longer starts matching.
- Content errors (empty text, bad file, bad LLM JSON) mark the resume `failed` and acknowledge; infrastructure errors are retried then dead-lettered (and marked failed).
- Second consumer on `match.approved` (`pdf_consumer`): makes sure a **PDF** of the resume exists (PDF → reuse; DOCX/RTF/ODT → LibreOffice; image/TXT → A4 PDF),
  stores it privately in Cloudinary (`resumes/<applicantId>/pdf/<resumeId>.pdf`), saves `Resume.pdfPublicId`, publishes `resume.pdf.ready` or `resume.pdf.failed`. Idempotent (fixed PDF id per resume).
- Parsed resume shape: `currentTitle, summary, skills[], experience[{title, company, startDate, endDate, description}], projects[{name, description}], education, certifications[], cgpa, branch, passingYear, backlogs, experienceYears` (branch, passingYear, backlogs are [new]; `null` when not stated).
- Resume text is treated as data; the prompt tells the model to ignore instructions inside it.

### 6.2 jd-extractor-agent
- Consumes `jd.uploaded`: downloads the JD document, extracts text (same file types), LLM → one or more **roles**, validates, and in one DB transaction (under a row lock)
  inserts `JobRole` rows plus `job_role_embeddings`, sets the posting `extracted`, then publishes `jd.extracted { jobPostingId, companyId, roleIds }`.
- Skips stopped postings and already-extracted ones; if the company stops the job while the LLM is reading, the result is discarded.
- Role requirements shape: `title, summary, requiredSkills[], preferredSkills[], minExperienceYears, qualifications, responsibilities[]`.
  [new] plus `level` (fresher | experienced | any), `track` and `stacks[]` (taxonomy ids; `other` when unsure, section 9.10) and optional eligibility rules (section 9.5).

### 6.3 matching-agent
Decides which resume is eligible for which role. **No LLM in the decision** — deterministic, explainable, immune to prompt injection in resumes. See section 8.
- Consumes `resume.confirmed`, `resume.updated` (score one **confirmed, active** resume against compatible roles), `jd.extracted` (score compatible active resumes against each new role),
  `profile.updated` (roles with academic rules), `resume.deleted`, `job.role.deleted` (drop the role vector).
- Works only on confirmed, non-superseded resumes and only on compatible (track/stack) pairs; efficiency rules are in section 8.
- Publishes `match.computed` (all eligible pairs + the best few near-misses) and `match.scanned` (every evaluated pair, chunked, for dashboard counts).
- `GET /model` shows the live scorer version, threshold, embedder and metrics; `GET /stats` shows per-run efficiency counters [new].

### 6.4 feedback-agent (career-coach)
Writes guidance for candidates using the Groq LLM, always grounded in data and labelled as AI generated.
- Today it consumes `match.computed` and, for **not-eligible** matches with score ≥ 0.2, writes a gap-analysis improvement guide (uses the matching result and an
  anonymised benchmark of the best eligible applicants for the same role: only skills, years of experience, education) and publishes `feedback.ready`.
- [new] it uses the resume the match was computed on. Two more modes, triggered by the company's decision (section 9.6): **prep guide** for shortlisted candidates and **rejection feedback** for rejected ones.

### 6.5 chatbot-agent
HTTP only (`POST /chat`), called by chat-service. Builds context from the database, then asks the LLM (plain-text answers, brief, same language as the user, context treated as data).
- **Applicant:** the resume used for that match (`Match.resumeId`), the role requirements, and the match result for that role (score, eligible, reason, matched/partial/missing skills, feedback).
  Knows only this applicant. Never promises a job or interview.
- **Company:** [new target] explains everything the company can see on its own dashboard — see section 9.7. Today it receives per-role counts only.

---

## 7. Events (Redis Streams) and queues

Payloads are JSON in a single field `data`. Consumer group names are per consuming service.

| Stream | Producer | Consumers |
|---|---|---|
| `resume.uploaded` | resume-service | resume-parser-agent |
| `resume.parsed` | resume-parser-agent | websocket-gateway, notification-service [new] (review & confirm prompt) |
| `resume.confirmed` [new] | resume-service | matching-agent |
| `resume.updated` | resume-service (confirmed resumes only) | matching-agent |
| `resume.superseded` [new] | resume-service | matching-results-service |
| `resume.deleted` [new] | resume-service | matching-agent, matching-results-service |
| `jd.uploaded` | job-service | jd-extractor-agent |
| `jd.extracted` | jd-extractor-agent; job-service (manual role create/edit, reopen) | matching-agent, websocket-gateway |
| `job.role.deleted` | job-service | matching-agent, matching-results-service |
| `job.stopped` | job-service | (state is read from DB) |
| `match.computed` | matching-agent | matching-results-service, feedback-agent, websocket-gateway |
| `match.scanned` | matching-agent | matching-results-service |
| `feedback.ready` | feedback-agent | matching-results-service, websocket-gateway |
| `match.approved` | matching-results-service | resume-parser-agent |
| `resume.pdf.ready` / `resume.pdf.failed` | resume-parser-agent | matching-results-service |
| `candidate.ready` | matching-results-service | websocket-gateway |
| `<stream>.dead` | every consumer after max retries | operators / admin health page [new] |
| `profile.updated` [new] | user-service (academic fields changed) | matching-agent |
| `candidate.shortlisted` [new] | matching-results-service | feedback-agent, notification-service |
| `candidate.rejected` [new] | matching-results-service | feedback-agent, notification-service |
| `prep.ready`, `rejection-feedback.ready` [new] | feedback-agent | matching-results-service, notification-service |
| `notification.created` [new] | notification-service | websocket-gateway |

BullMQ queue `email-queue` (5 attempts, exponential backoff): today jobs `password-reset` (auth-service), `eligibility-result`, `feedback-guide`,
`candidate-ready` (matching-results-service). [new] only notification-service enqueues emails, and the set is reduced to four events (section 9.4).
Streams are trimmed with `MAXLEN ~ 10000`; every consumer reclaims idle pending messages.

---

## 8. Matching engine (how a resume is judged against a role)

```
resume.confirmed / resume.updated ─┐   compatibility gate (track + stack, SQL)
profile.updated ───────────────────┼─> best-first retrieval (pgvector HNSW, batches) ─> hash skip ─> features ─> logistic scorer + hard gates ─> match.computed
jd.extracted (new/edited role) ────┘
```

1. **Profile text.** The same builder (`profile_text.py`) turns a parsed resume and a role into structured text, so both sides are embedded alike.
2. **Compatibility gate (before any vector search).** Only **confirmed, non-superseded** resumes take part. A resume matches a role only if the tracks are compatible
   (same track; a `fullstack` resume or role bridges to `frontend` and `backend`) and the role's `stacks` include the resume's stack. `other` means no gating.
   A Python backend resume is therefore never scored against a Java role. The gate is a SQL filter, so rejected pairs cost nothing.
3. **Best-first retrieval.** pgvector cosine search with an HNSW index, in batches of 25 ordered by similarity; stop early after two batches with no eligible result or after
   `MAX_ELIGIBLE_PER_ROLE` (200) eligible results; then keep the top-K (`TOP_K_ROLES_PER_RESUME` 50, `TOP_K_RESUMES_PER_ROLE` 100). An optional cheap prefilter (`PREFILTER_MIN_COSINE`)
   is enabled only if the gold set shows recall is not hurt.
4. **Skip unchanged pairs.** `inputHash = sha1(resumeId, parsedData, role title + requirements, academic values used by rules, model version)`. If the stored `RoleScan` row has the same hash, the pair is not re-scored.
5. **Caches.** In-process LRU caches (`SIDE_CACHE_SIZE`, 2000) for the resume side and role side features, so a role scored against many resumes is prepared once.
6. **Best resume per applicant and role** within a run: only the best-scoring resume of an applicant is published for a given role.
7. **Features (14).** For every required skill, find the closest resume skill and the closest evidence sentence (projects/experience) by cosine similarity, ramp to a 0..1 credit.
   Summarised into: `req_cov, req_exact, req_sem_mean, req_sem_min, req_hi_frac, req_mid_frac, req_ev_mean, pref_cov, global_sim, title_sim, exp_score, exp_over, edu_score, has_req_skills`.
   Skill aliases and normalisation (`skills.py`: "ReactJS" ≈ "react") are applied first.
8. **Scorer.** A logistic model (`app/artifacts/scorer.json`, trained by `training/`) gives a probability; eligible if probability ≥ threshold **and** no hard gate fails.
   Hard gates: required-skill coverage below `MIN_REQUIRED_SKILL_COVERAGE` (0.35); experience below half of the minimum with a gap of at least a year (off for fresher/any roles);
   campus rules (section 9.5). A vetoed pair never displays a score above the threshold.
9. **Explanation.** Each result carries a human-readable `reason`, `matchedSkills`, `partialSkills` (≥0.30 credit), `missingSkills`, `unverifiedRules`, and a `breakdown` (features, per-skill evidence, gates, model version).
10. **What is published.** All eligible pairs, plus at most 5 near-misses (`MAX_INELIGIBLE_*`) with score ≥ 0.20; every evaluated pair goes to `match.scanned` (with its `inputHash`).
11. **Triggers.** `resume.confirmed/updated` → that resume vs compatible roles. `jd.extracted` → compatible active resumes vs the role. `profile.updated` → roles that have academic rules.
    `resume.deleted` → the applicant's remaining resumes vs the roles the deleted resume had been scanned for.
12. **Observability.** Per run: retrieved, gated, prefiltered, skipped by hash, scored, eligible, milliseconds — logged and returned by `GET /stats`.

Training (`apps/matching-agent/training`): see section 9.9.

---

## 9. Features (agreed design)

### 9.1 Registration modes (admin) [new]
A system setting in auth-service, `registrationMode`:
- `open` — anyone can sign up as applicant or company.
- `invite_only` — self-signup is rejected; only accounts created by the admin exist (typical college use: the college adds students and companies).
- `domain` — self-signup allowed only for emails whose domain is in `allowedDomains` (e.g. `college.edu`).

The check happens **on the server in `POST /auth/signup`**, not only in the UI. A public endpoint `GET /auth/registration-mode` lets the signup page adapt.
Admin endpoints: read/update the setting; **bulk import** users from CSV (email, role, name, and for students CGPA, branch, passing year, backlogs);
each imported user gets a "set your password" email (the password-reset token flow with an invite template).
Admin can also deactivate/reactivate/delete a user (`User.isActive`; deactivation also removes the refresh token).
Code and UI use neutral wording ("institution", "admin"), not "college".

### 9.2 Company approval [new]
`CompanyProfile.status = pending | approved | rejected`.
- A self-registered company starts `pending` only when `registrationMode != invite_only` **and** the setting `companyApprovalRequired` (default true) is on; otherwise it is `approved`. Companies added by the admin are always `approved`.
- A pending company can log in and edit its profile but **cannot upload JDs or create roles** (job-service checks the status through an internal user-service call).
- Admin approves/rejects from the companies page; the company gets an in-app notification.
- Optional setting `jobApprovalRequired` (default off): new job postings wait for admin approval before extraction/matching.

### 9.3 Admin area [new]
Registration mode and imports (9.1), company approval (9.2), user management, platform analytics (existing `/stats/admin`: totals, by company, by role),
placement-style views (e.g. by branch when academic data exists) with CSV export, a **system health** page (dead-letter stream counts per stream, consumer status), and an audit log
(`AuditLog { actorId, action, target, meta, createdAt }` in users_service).

### 9.4 Notifications: in-app + selective email [new]
`notification-service` becomes the single decision point.
- Own schema `notifications_service`: `Notification { id, userId, type, title, body, data (JSON), readAt, createdAt, expiresAt }`. Retention **90 days** (daily cleanup).
- It consumes the domain events (including `candidate.shortlisted`, `candidate.rejected`, `prep.ready`, `rejection-feedback.ready`) and uses a policy table
  `event → { inApp: bool, email: bool }`. It writes the row and publishes `notification.created`; websocket-gateway pushes it to the user's room (bell icon updates live).
- HTTP (via nginx `/notifications/`): `GET /notifications`, `GET /notifications/unread-count`, `PATCH /notifications/:id/read`, `PATCH /notifications/read-all`.
- The existing websocket events (`resume.parsed`, `match.computed`, …) stay: they refresh the open page. Notifications are the persistent record.
- **Email is sent only for four events:** password reset (also used for account invites), "you are eligible — review and approve" (applicant),
  "candidate ready" (company), "shortlisted + prep" (applicant). Everything else is in-app only.
- When a resume finishes parsing the applicant gets an in-app "Review and confirm your resume" notification (no email).
- Not-eligible matches do **not** create a notification each; the applicant gets one notification when the improvement guide (`feedback.ready`) is ready. No "application update" email.
- The shortlisted email is sent immediately with the company's own details (it never waits for the LLM); the AI prep guide appears in-app when ready.

### 9.5 Eligibility rules and role level [new]
- Role requirements gain optional fields: `minCgpa`, `allowedBranches[]`, `passingYears[]`, `maxBacklogs`, `level` (`fresher | experienced | any`).
  The JD extractor fills them when the JD states them; the company can edit them in the role form. A rule that is not set is not applied.
- Applicant academic data: `cgpa, branch, passingYear, backlogs` on `ApplicantProfile`, each with a source:
  **verified** (imported by admin CSV) › **resume** (parsed) › **self** (entered by the applicant when the resume does not contain it).
  Effective value follows that priority; verified values are locked for the applicant. The UI asks the applicant to fill missing values.
  `profile.updated` makes matching-agent re-evaluate.
- Rules are **hard gates, separate from the ML score** (like the existing skill/experience gates). A failed rule makes the pair not eligible and the `reason` names the rule.
  If the applicant's value is **unknown**, the rule does not fail: the pair stays eligible with a flag "CGPA not verified" shown to the applicant (to complete the profile) and to the company.
- `level`: for fresher/any roles the experience gate is off and projects, internships and skill evidence carry more weight (extra features `is_fresher_role`, `project_evidence`, `has_internship`);
  experienced roles keep the current experience handling.

### 9.6 Shortlist and reject flows, and the coach agent [new]
`PATCH /matches/:id/decision` is extended (still only for approved candidates of the company's own roles).

**Shortlist form** (structured): required `roundName`, `mode` (online/offline/phone); optional `scheduledAt`, `bring` (what to carry/prepare), `link` or `address`, `note`.
→ event `candidate.shortlisted` → candidate gets the email (company details, verbatim) and an in-app notification.
→ feedback-agent writes an **AI prep guide** from the role requirements, the candidate's gaps/strengths and the round type, stored on the match and shown in a separate section
labelled "AI prep tips". The agent never invents dates, places or process details: company-provided details are shown as written.

**Reject form:** required `reasonCategory` (`skills_gap | experience | resume_quality | position_filled | other`), optional `messageToCandidate`.
→ event `candidate.rejected` → in-app notification (no email).
→ for `skills_gap`, `experience`, `resume_quality` the agent writes **improvement feedback** (resume mistakes, missing skills, gaps vs role requirements), labelled AI generated;
for `position_filled` / `other` only a polite message is sent. The company's internal reason is never shown to the candidate; only `messageToCandidate` is.

Both decisions are stored (`decision`, `decidedAt`, `decidedBy`, plus the form data) and also act as real labels for retraining the scorer (section 9.9).
The existing not-eligible improvement guide is unchanged.

### 9.7 Company-side chatbot [new target]
The assistant explains, in normal chat, **exactly the data the company sees on its dashboard** and what each thing means.
Context built in chatbot-agent for the calling company only: its roles and requirements, per-role counts (scanned, matched, applied/approved, shortlisted),
and the **approved** candidates it can see (name, score, matched/missing skills, decision status). It also gets a short glossary of dashboard terms (Scanned, Matched, Applied, Shortlisted, score, eligible).
It never receives unapproved candidates or resume files, and says so if asked for something outside that data.

### 9.8 Applicant consent flow (existing, intentional)
The resume only goes to a company with the applicant's explicit approval.
```
matching-agent ──match.computed──▶ results-service   Match(applicantStatus = pending)   + email to applicant "you're eligible, review & approve"
applicant opens Matches, sees WHICH COMPANY, clicks Approve   (blocked if the company stopped the job)
        PATCH /matches/:id/approval {approved:true}
        match.approved ──▶ resume-parser-agent (pdf_consumer): PDF made and stored privately
        resume.pdf.ready ──▶ results-service: Match.resumeStatus = ready; email to the COMPANY (no attachment); candidate.ready ─▶ websocket ─▶ company dashboard live
company dashboard: only APPROVED candidates; "Download resume (PDF)" = GET /resumes/:id/pdf (signed 15-minute link)
```
Declined can later become approved; approved cannot be undone. A resume that cannot be converted sets `resumeStatus = failed` and the applicant sees "Try again".

### 9.9 Making the matching proper: real dataset training [new]
- **Dataset:** Hugging Face `cnamuangtoun/resume-job-description-fit` (~8k resume/JD pairs labelled Good Fit / Potential Fit / No Fit). Check the dataset's license on its Hugging Face page before relying on it.
  `training/build_real_dataset.py` already converts raw text to the exact structured shape the production parsers produce (same prompts — keep them in sync), caches parses, maps Good Fit → 1, No Fit → 0, drops Potential Fit.
- **Tech focus:** keep only tech roles/resumes (filter by title and skills against a curated tech skill taxonomy; extend `build_aliases.py` / `skills.py`).
- **Splits:** group by role/resume so train and test never share a role or resume.
- **Gold test set:** the team hand-labels ~200 resume/role pairs once; used only for testing, never for training.
- **Metrics:** per-role ranking metrics (precision@k, NDCG@k) plus accuracy/precision/recall/ROC-AUC and the baselines (cosine-only, keyword). Pick the threshold for a precision target (`--beta`).
- **Embedder:** compare candidates with `compare_embedders.py` (another 384-dim model such as `bge-small-en` is a drop-in).
- **Later:** fine-tune with real recruiter decisions (`scripts/export_real_labels.py`, real rows weighted 3×); log `modelVersion` on every match. Recruiter labels exist only for approved candidates, so they are biased toward positives; keep the public dataset as the base.
- **Fairness rule:** never use name, gender, photo or institution name as features.
- The current `scorer.json` (`lr-2026-10-07-n6000`) was trained on a 6000-pair bootstrap set; it is replaced by a model trained on the real dataset.

### 9.10 Confirm gate, target roles and multiple resumes [new]
- **Confirm gate:** parsing is not matching. After parsing, the applicant reviews the extracted data (and academic fields) and presses **Confirm** (`POST /resumes/:id/confirm`). Only then `resume.confirmed` starts matching. Edits after confirmation publish `resume.updated`; edits before it publish nothing.
- **Target role per resume:** at upload the applicant picks a **track** and a **stack** from a fixed taxonomy (`GET /resumes/target-roles`), e.g. Backend · Java, Backend · Python, Frontend · React.
  Tracks: frontend, backend, fullstack, mobile, data_ml, devops_cloud, qa, other, each with its stack ids (the same JSON file is kept in resume-service, jd-extractor-agent and matching-agent, with a check script).
- **One active resume per target role:** an applicant can hold up to 5 resumes (non-superseded) for different targets, but only one active resume per `(applicantId, targetKey)`.
  Confirming a new resume with the same target replaces the old one.
- **Roles carry the same labels:** the JD extractor assigns each role a `track` and `stacks[]`; the company can edit them. Wrong or unknown classification falls back to `other` (no gating) so that candidates are not hidden by mistake.
- **Compatibility function** (section 8, step 2) decides which resume can be matched with which role. This avoids matching a Python resume against a Java requirement and saves resources.
- A match exists once per (applicant, role): the best compatible resume wins; after the applicant approves, that resume is frozen for that match.

### 9.11 Storage cleanup [new]
- On confirm, the replaced resume is removed completely: Cloudinary original **and** generated PDF, the embedding row, the database row — unless an approved match uses it; then only `supersededAt` is set and the file stays until the match no longer references it.
- `DELETE /resumes/:id` uses the same routine (409 if an approved match uses it).
- A newer unconfirmed upload with the same target key deletes the older unconfirmed one.
- A daily cleanup job removes superseded resumes no approved match references and never-confirmed uploads older than `UNCONFIRMED_RESUME_TTL_DAYS` (default 14), publishing `resume.deleted`.
- Replacing an avatar deletes the old avatar file in Cloudinary.
- Notifications older than 90 days are deleted daily.

### 9.12 Admin seed and reset [new]
The project lives on GitHub, so the first admin is created by code, not by hand: `ADMIN_EMAIL` + `ADMIN_PASSWORD` (≥ 12 characters) are read by `pnpm --filter auth-service seed`, which is idempotent.
Each service has `db:reset` (drop and recreate its schema); the root scripts `pnpm db:reset:all` and `pnpm seed` run them all. Default system settings are written by the seed.

---

## 10. End-to-end workflows

**A. Signup** — web → `POST /auth/signup` (checks registration mode [new]) → user created (bcrypt) → internal `POST user-service/internal/profiles` → tokens returned.
Company accounts start `pending` in open mode [new]. Admin-created users receive a set-password email [new].

**B. Resume** — applicant picks target role (track + stack) → `POST /resumes/upload` → Cloudinary + `Resume(pending)` → `resume.uploaded` → resume-parser-agent extracts, parses, embeds → `Resume(parsed)` → `resume.parsed` →
websocket and an in-app notification tell the applicant to review → applicant fixes data and **confirms** → `resume.confirmed` (the old resume of the same target is replaced and its storage cleaned) →
matching-agent scores it against compatible roles. Editing a confirmed resume (`PATCH /resumes/:id`) → `resume.updated` → re-match (only changed pairs).

**C. Job description** — `POST /jobs/upload` → `jd.uploaded` → jd-extractor-agent creates roles + embeddings → `jd.extracted` → websocket updates the company page and matching-agent scores the best candidates for every new role.
Company can add/edit/delete roles by hand (re-embedded and re-matched), stop and reopen a job.

**D. Match** — matching-agent publishes `match.computed` / `match.scanned` → results-service upserts `Match` (idempotent) and `RoleScan` →
applicant is told (email only when eligible, decided by notification-service; in-app) → feedback-agent writes the improvement guide for not-eligible near-misses → `feedback.ready`.

**E. Consent** — section 9.8.

**F. Company decision** — company opens the role's candidate list (approved only), downloads the PDF, shortlists (form) or rejects (form) → section 9.6.

**G. Chat** — applicant: one conversation per match with the AI assistant; company: quick ask on its dashboard. Both go web → nginx → chat-service → chatbot-agent.

**H. Live updates and notifications** — events on Redis Streams → websocket-gateway → user room → the page refetches; persistent items appear in the notification bell (section 9.4).

---

## 11. Frontend (apps/web)

Next.js App Router with route groups and a role guard (`RequireRole`):
- `(auth)`: `/login`, `/signup` (shows the registration mode), `/forgot-password`, `/reset-password`
- `(applicant)/applicant`: `dashboard`, `resume` (resume cards, target-role dropdowns, review & confirm screen), `matches` (approve/decline, shortlist details, AI prep tips, rejection feedback), `feedback`, `notifications`, `chat`, `chat/[conversationId]`
- `(company)/company`: `dashboard`, `jobs` (upload, stop/reopen, role forms), `roles/[roleId]/applicants` (approved candidates, resume PDF, shortlist/reject), `ask` (AI assistant), `notifications`
- `(admin)/admin`: `dashboard`, `applicants`, `companies`, `jobs` (posting approval), `import` (CSV), `settings` (registration mode, company approval), `health`, `audit`, `notifications`
- [new] notification bell and list, academic fields in the applicant profile, shortlist/reject modals, role form with level/track/stacks/rules, matches showing the resume used and unverified rules,
  admin settings (registration mode, company approval switch, CSV import, company approval, job approval, system health, audit log).

Client plumbing: `lib/apiClient.ts` (axios, `NEXT_PUBLIC_API_URL`, bearer token, single-flight refresh on 401, logout on failure), `lib/socket.ts` (`NEXT_PUBLIC_WS_URL`,
token passed in the socket auth callback so refreshed tokens are used on reconnect), `store/authStore.ts` (Zustand), `lib/queryClient.ts` (React Query), zod schemas in `lib/schemas`.

---

## 12. Known gaps in the current code (details only)
- `notification-service` calls `sendFeedbackGuide(email, feedback)` without the `roleTitle` it receives, so the feedback email subject is always generic.
- `job.stopped` is published but nothing consumes it (stop state is read from the database).
- Admin has read-only lists and stats; README mentions approving companies/jobs, which does not exist yet (section 9.2).
- Only the Python agents reclaim idle pending stream messages; the Node consumers (results-service, websocket-gateway) read new messages only.
- Streams are never trimmed (no `MAXLEN`); dead-letter streams have no reader yet (admin health page [new]).
- `matching-agent/app/core/llm_client.py` is not used by the matching decision.
- The old per-match emails in matching-results-service (`eligibility-result`, `feedback-guide`) are replaced by notification-service's policy [new].
- `packages/*` is listed in `pnpm-workspace.yaml` but the folder does not exist (no shared library; auth/redis boilerplate is repeated per service).

---

## 13. README standard (to be added to every service)

Each service/agent gets its own `README.md` with these sections: **Purpose · Port · Routes (method, path, role) · Events consumed/produced · Database (schema, tables) ·
Environment variables (table: name, required, example, meaning) · Run locally · Test · Depends on**. The repository root gets one `README.md` for the whole project.
Drafts follow; `.env.example` should list the same variables.

### 13.1 Root `README.md` (draft)

````markdown
# Career Matching Platform

Multi-agent AI platform that connects applicants and companies for tech jobs (fresher and experienced).
Resumes and job descriptions are parsed by AI agents, a deterministic matching engine decides eligibility,
applicants approve sharing their resume, companies shortlist or reject, and candidates receive AI guidance.

## Architecture
Next.js → Nginx → 8 NestJS services; 5 FastAPI agents talk to services only through Redis Streams (chat-service calls chatbot-agent over HTTP).
PostgreSQL (one schema per service, pgvector), Redis (Streams + BullMQ), Cloudinary (files), Groq (LLM), Resend/Gmail (email).
[diagram from section 4 of PROJECT_SPEC.md]

## Services and ports
| App | Port | Purpose |
|---|---|---|
| web | 3000 | Next.js frontend |
| auth-service | 3001 | accounts, JWT, registration mode |
| user-service | 3002 | profiles, admin lists, company approval |
| resume-service | 3003 | resume upload and parsed data |
| job-service | 3004 | JD upload, roles, stop/reopen |
| matching-results-service | 3005 | matches, consent, decisions, stats |
| notification-service | 3006 | emails + in-app notifications |
| websocket-gateway | 3007 | live events (socket.io) |
| chat-service | 3008 | chat storage, calls chatbot-agent |
| resume-parser-agent | 8001 | resume → structured data, resume PDFs |
| jd-extractor-agent | 8002 | JD → roles and requirements |
| matching-agent | 8003 | eligibility scoring |
| feedback-agent | 8004 | improvement, prep and rejection guidance |
| chatbot-agent | 8005 | AI assistant |
Nginx listens on 80 and routes to the services; agents are never exposed.

## Prerequisites
Node 20+, pnpm 9, Python 3.11+, PostgreSQL with pgvector, Redis, Tesseract OCR, LibreOffice (for resume PDFs), Cloudinary account, Groq API key.

## Quick start (local)
1. `pnpm install` at the repo root.
2. Copy each service's `.env.example` to `.env` (see its README). Use the same `JWT_SECRET` in every service that verifies tokens.
3. For every NestJS service with Prisma: `pnpm --filter <service> exec prisma generate` and apply the schema.
4. Start Redis and PostgreSQL, then each service with `pnpm --filter <service> start:dev`.
5. For every agent: `python -m venv .venv`, `pip install -r requirements.txt`, `uvicorn app.main:app --port <port>`.
6. Start the frontend: `pnpm --filter web dev`; start nginx with `infra/nginx/nginx.conf`.

## Shared environment
`DATABASE_URL`, `REDIS_URL`, `JWT_SECRET` (+ `JWT_REFRESH_SECRET` in auth-service), `CLOUDINARY_*`, `GROQ_API_KEY`, `EMAIL_PROVIDER`, `WEB_URL`.

## Roles
APPLICANT, COMPANY, ADMIN — see PROJECT_SPEC.md.

## More
Full design: `PROJECT_SPEC.md`. Consent flow: `docs/consent-flow.md`. Matching training: `apps/matching-agent/training/README.md`.
````

### 13.2 NestJS service READMEs (drafts)

````markdown
# auth-service  (port 3001, schema auth_service)
Purpose: identities, login, JWT access/refresh tokens, password reset, registration mode, admin user import.
Routes: POST /auth/signup · /auth/login · /auth/refresh · /auth/logout (JWT) · /auth/forgot-password · /auth/reset-password ·
GET /auth/registration-mode [new] · admin: registration settings, CSV import, activate/deactivate [new] · internal: GET /internal/users/:id/email
Queue: BullMQ `email-queue` job `password-reset`.
Env: PORT=3001 · DATABASE_URL (required) · REDIS_URL (required) · JWT_SECRET (required) · JWT_REFRESH_SECRET (required) · USER_SERVICE_URL (required, e.g. http://localhost:3002) ·
INTERNAL_API_KEY · ADMIN_EMAIL · ADMIN_PASSWORD (≥12 chars) · SEED_ADMIN_ON_BOOT=false · ENABLE_DOCS=false
Run: pnpm --filter auth-service start:dev · Seed admin: pnpm --filter auth-service seed · Reset schema: pnpm --filter auth-service db:reset · Test: pnpm --filter auth-service test
Depends on: PostgreSQL, Redis, user-service.
````

````markdown
# user-service  (port 3002, schema users_service)
Purpose: applicant and company profiles, avatars, admin lists, company approval [new], academic fields [new], audit log [new].
Routes: GET|PATCH /applicants/me · POST /applicants/me/avatar · POST /applicants/summaries (COMPANY/ADMIN) ·
GET|PATCH /companies/me · POST /companies/me/avatar · GET /admin/applicants · GET /admin/companies (ADMIN) · internal: POST /internal/profiles, GET /internal/companies/:userId/name
Events: publishes `profile.updated` [new].
Env: PORT=3002 · DATABASE_URL · REDIS_URL · JWT_SECRET · CLOUDINARY_CLOUD_NAME · CLOUDINARY_API_KEY · CLOUDINARY_API_SECRET (all required)
Run: pnpm --filter user-service start:dev · Test: pnpm --filter user-service test
````

````markdown
# resume-service  (port 3003, schema resumes_service)
Purpose: resume upload (Cloudinary) per target role, review/confirm, replace, delete with storage cleanup, signed PDF link for approved companies.
Routes: GET /resumes/target-roles · POST /resumes/upload (fields file, targetTrack, targetStack; pdf, docx, txt, jpg, jpeg, png, bmp, tiff, webp; max 10 MB) · GET /resumes/mine · PATCH /resumes/:id · POST /resumes/:id/confirm · DELETE /resumes/:id · GET /resumes/:id/pdf (COMPANY/ADMIN)
Events: publishes `resume.uploaded`, `resume.confirmed`, `resume.updated`, `resume.superseded`, `resume.deleted`.
Env: PORT=3003 · DATABASE_URL · REDIS_URL · JWT_SECRET · CLOUDINARY_CLOUD_NAME · CLOUDINARY_API_KEY · CLOUDINARY_API_SECRET (all required) · UNCONFIRMED_RESUME_TTL_DAYS=14
Run: pnpm --filter resume-service start:dev · Test: pnpm --filter resume-service test
````

````markdown
# job-service  (port 3004, schema jobs_service)
Purpose: JD upload, roles CRUD, stop/reopen job; checks company approval before posting [new].
Routes (COMPANY): POST /jobs/upload · GET /jobs/mine · POST /jobs/:id/stop · POST /jobs/:id/reopen · GET|POST /jobs/:id/roles · PATCH|DELETE /jobs/roles/:roleId · internal: GET /internal/roles/:id
Events: publishes `jd.uploaded`, `jd.extracted` (manual roles, reopen), `job.role.deleted`, `job.stopped`, `job.approval.changed` [new].
Env: PORT=3004 · DATABASE_URL · REDIS_URL · JWT_SECRET · CLOUDINARY_CLOUD_NAME · CLOUDINARY_API_KEY · CLOUDINARY_API_SECRET · USER_SERVICE_URL · AUTH_SERVICE_URL · INTERNAL_API_KEY [new]
Run: pnpm --filter job-service start:dev · Test: pnpm --filter job-service test
````

````markdown
# matching-results-service  (port 3005, schema matches_service)
Purpose: stores matches, applicant consent, company decisions (shortlist/reject forms [new]), dashboard stats.
Routes: GET /matches/mine · PATCH /matches/:id/approval (APPLICANT) · GET /matches/role/:jobRoleId · PATCH /matches/:id/decision (COMPANY) · GET /stats/company · GET /stats/admin
Events: consumes `match.computed`, `match.scanned`, `feedback.ready`, `job.role.deleted`, `resume.pdf.ready`, `resume.pdf.failed`, `prep.ready` [new], `rejection-feedback.ready` [new];
publishes `match.approved`, `candidate.ready`, `candidate.shortlisted` [new], `candidate.rejected` [new]. Does not send email itself [new]; also consumes `resume.superseded`, `resume.deleted` [new].
Env: PORT=3005 · DATABASE_URL · REDIS_URL · JWT_SECRET (all required)
Run: pnpm --filter matching-results-service start:dev · Test: pnpm --filter matching-results-service test
Note: reads jobs_service and users_service schemas for role/company info.
````

````markdown
# notification-service  (port 3006, schema notifications_service [new])
Purpose: sends emails from BullMQ `email-queue`; stores and serves in-app notifications [new]; applies the event → (in-app, email) policy [new].
Email events: password reset/invite, eligible, candidate ready, shortlisted+prep. Everything else in-app only.
Routes [new]: GET /notifications · GET /notifications/unread-count · PATCH /notifications/:id/read · PATCH /notifications/read-all
Events: consumes domain streams [new]; publishes `notification.created` [new].
Env: PORT=3006 · REDIS_URL · AUTH_SERVICE_URL · EMAIL_PROVIDER=gmail|resend · EMAIL_FROM · WEB_URL ·
gmail: GMAIL_USER, GMAIL_APP_PASSWORD, GMAIL_FROM_NAME · resend: RESEND_API_KEY · dev: EMAIL_DEV_REDIRECT_TO (all dev mail to one inbox) · DATABASE_URL, JWT_SECRET [new]
Run: pnpm --filter notification-service start:dev
````

````markdown
# websocket-gateway  (port 3007)
Purpose: socket.io server; verifies the JWT at connection and joins room `user:<id>`; pushes stream events to users.
Events consumed: resume.parsed, jd.extracted, match.computed, feedback.ready, candidate.ready, notification.created [new].
Client: io(NEXT_PUBLIC_WS_URL, { auth: { token } }) — path /socket.io/ (nginx upgrades the connection).
Env: PORT=3007 · REDIS_URL · JWT_SECRET (required)
Run: pnpm --filter websocket-gateway start:dev
````

````markdown
# chat-service  (port 3008, schema chat_service)
Purpose: chat conversations (one per match) and messages; calls chatbot-agent; per-user rate limit.
Routes: GET /chat/conversations · PATCH /chat/conversations/:id · GET /chat/conversations/:id/messages · POST /chat/conversations/:id/messages (APPLICANT) · POST /chat/quick (COMPANY)
Env: PORT=3008 · DATABASE_URL · JWT_SECRET · CHATBOT_AGENT_URL (e.g. http://localhost:8005) · MATCHING_SERVICE_URL (e.g. http://localhost:3005) ·
JOB_SERVICE_URL (e.g. http://localhost:3004) · CHAT_RATE_PER_MINUTE=10 · CHAT_RATE_PER_DAY=200
Run: pnpm --filter chat-service start:dev
````

### 13.3 Agent READMEs (drafts)

````markdown
# resume-parser-agent  (FastAPI, suggested port 8001)
Purpose: resume file → structured data + embedding; resume PDF for approved matches.
Consumes: resume.uploaded, match.approved. Publishes: resume.parsed, resume.pdf.ready, resume.pdf.failed. Writes resumes_service.Resume and resume_embeddings.
Env: PORT · DATABASE_URL · REDIS_URL · GROQ_API_KEY · GROQ_MODEL · CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET · TESSERACT_PATH · SOFFICE_PATH · SOFFICE_TIMEOUT_SECONDS ·
PDF_MAX_INPUT_BYTES · ENABLE_RESUME_PARSER_CONSUMER=true · ENABLE_RESUME_PDF_CONSUMER=true
Run: pip install -r requirements.txt && uvicorn app.main:app --port 8001 · Test: python -m unittest / pytest in tests/
````

````markdown
# jd-extractor-agent  (FastAPI, suggested port 8002)
Purpose: job description → roles and requirements + role embeddings.
Consumes: jd.uploaded. Publishes: jd.extracted. Writes jobs_service.JobRole/JobPosting and job_role_embeddings.
Env: PORT · DATABASE_URL · REDIS_URL · GROQ_API_KEY · GROQ_MODEL · TESSERACT_PATH · ENABLE_JD_EXTRACTOR_CONSUMER=true
Run: pip install -r requirements.txt && uvicorn app.main:app --port 8002
````

````markdown
# matching-agent  (FastAPI, suggested port 8003)
Purpose: deterministic, explainable eligibility scoring (embeddings + logistic scorer + hard gates). No LLM in the decision.
Consumes: resume.confirmed, resume.updated, jd.extracted, job.role.deleted, profile.updated, resume.deleted [new]. Publishes: match.computed, match.scanned.
Endpoints: GET /health (503 if the consumer failed), GET /model, GET /stats [new].
Env: PORT · DATABASE_URL · REDIS_URL · EMBEDDING_BACKEND=minilm (hash only for tests) · EMBEDDING_MODEL_NAME=all-MiniLM-L6-v2 · SCORER_PATH · ELIGIBILITY_THRESHOLD (optional override) ·
MIN_REQUIRED_SKILL_COVERAGE=0.35 · EXPERIENCE_GATE_RATIO=0.5 · EXPERIENCE_GATE_MIN_GAP_YEARS=1 · TOP_K_ROLES_PER_RESUME=50 · TOP_K_RESUMES_PER_ROLE=100 ·
PREFILTER_MIN_COSINE (optional) · MAX_ELIGIBLE_PER_ROLE=200 · SIDE_CACHE_SIZE=2000 · BATCH_SIZE=25 · MAX_INELIGIBLE_PER_RESUME=5 · MAX_INELIGIBLE_PER_ROLE=5 · MIN_PUBLISH_SCORE=0.20 · LOG_LEVEL · ENABLE_MATCHING_CONSUMER=true
Run: uvicorn app.main:app --port 8003 · Test: EMBEDDING_BACKEND=hash python -m unittest discover -s tests -t . -v
Training: see training/README.md (build_real_dataset → train → evaluate; extra real labels via scripts/export_real_labels.py).
Scripts: scripts/backfill_embeddings.py [--rematch].
````

````markdown
# feedback-agent  (FastAPI, suggested port 8004)
Purpose: AI guidance — improvement guide (not eligible), prep guide (shortlisted) [new], rejection feedback (rejected, skills/experience/resume reasons) [new]. Always labelled AI generated.
Consumes: match.computed (uses the match's resume), candidate.shortlisted [new], candidate.rejected [new]. Publishes: feedback.ready, prep.ready [new], rejection-feedback.ready [new].
Env: PORT · DATABASE_URL · REDIS_URL · GROQ_API_KEY · ENABLE_FEEDBACK_CONSUMER=true
Run: uvicorn app.main:app --port 8004
````

````markdown
# chatbot-agent  (FastAPI, suggested port 8005) — internal only
Purpose: AI assistant. Applicant: explains their resume, the role and their match result. Company: explains the dashboard data the company can see.
Endpoint: POST /chat { userId, role, message, jobRoleId?, history? } → { reply }. Called only by chat-service; never exposed through nginx.
Env: PORT · DATABASE_URL · REDIS_URL · GROQ_API_KEY
Run: uvicorn app.main:app --port 8005
````

### 13.4 Web `apps/web/README.md` (draft)
See apps/web/README.md (env: NEXT_PUBLIC_API_URL, NEXT_PUBLIC_WS_URL, NEXT_PUBLIC_USE_MOCKS; run: pnpm --filter web dev)

````markdown
# web  (Next.js, port 3000)
Env: NEXT_PUBLIC_API_URL (nginx base URL, e.g. http://localhost) · NEXT_PUBLIC_WS_URL (socket.io, e.g. http://localhost:3007 or the nginx URL)
Run: pnpm --filter web dev · Build: pnpm --filter web build · Lint: pnpm --filter web lint
````

---

## 14. Operations checklist

- Every service: `GET /health`; JSON logs with `requestId`; Swagger at `/docs` only when `ENABLE_DOCS=true`; `/internal/*` protected by `INTERNAL_API_KEY` and blocked at nginx.
- Streams trimmed with `MAXLEN ~ 10000`; Node and Python consumers reclaim idle messages; admin health page shows `.dead` stream sizes.
- After any schema reset: `pnpm db:reset:all` then `pnpm seed`.
- Daily jobs: resume cleanup (section 9.11), notification expiry (90 days).
- Never log secrets; the admin password is read from the environment only.

## 15. Last phase — containerisation

Done only after every feature above is merged and the e2e checks pass. Each app gets a `Dockerfile` and `.dockerignore`; the repo gets a root `docker-compose.yml`
(Postgres with pgvector, Redis, all apps, nginx as the only published port), `.env.compose.example`, `infra/nginx/nginx.docker.conf`, and a README section "Run with Docker".
Acceptance: one command starts the whole system and the e2e suite passes.
