# Team Plan & Contracts (READ FIRST — shared, read-only)

Project: Career Matching Platform. Full design: `PROJECT_SPEC.md` (sections referenced as "Spec §N").
This file = **who owns what** + the **contracts** (API shapes, event payloads, DB columns) between owners.
Because contracts are fixed here, all four people work in parallel and never edit the same file.
This is the final, merged version: it already contains every agreed rule (older drafts and addenda are obsolete — discard them).

Scope: one institution per deployment (no multi-college), **tech jobs only** for now, Docker is the **last** phase (section 10).

---

## 1. The one rule

**You only change files inside the paths you own (table below). Never edit another owner's path, not even a one-line fix.**
If you need something from another owner, either (a) it is already in the contracts below — just use it, or (b) message the owner / lead (Dev 4) and wait.
A contract changes only through Dev 4, who updates this file and tells everyone.

## 2. Ownership map (every path has exactly one owner)

| Owner | Paths |
|---|---|
| **Dev 1 — Identity, Admin & Notifications** | `apps/auth-service`, `apps/user-service`, `apps/notification-service`, `apps/websocket-gateway`, `infra/nginx` |
| **Dev 2 — Matching & ML** | `apps/matching-agent`, `apps/jd-extractor-agent`, `apps/resume-parser-agent`, `apps/resume-service` |
| **Dev 3 — Decisions & AI guidance** | `apps/matching-results-service`, `apps/job-service`, `apps/feedback-agent`, `apps/chatbot-agent`, `apps/chat-service`, `docs/consent-flow.md` |
| **Dev 4 — Web & project docs (lead)** | `apps/web`, `e2e/`, `.github/`, root `README.md`, `PROJECT_SPEC.md`, root `package.json`, `pnpm-workspace.yaml`, `docker-compose.yml`, `.env.compose.example`, `.gitignore`, `.gitleaks.toml`, this contracts file |

Each owner also writes, inside their own folders, a `README.md` and `.env.example` for every app they own (template: Spec §13).

### Git rules
- Branch per person: `dev1/...`, `dev2/...`, `dev3/...`, `dev4/...`. PR into `main`. A PR may only contain files from the author's paths.
- `pnpm-lock.yaml` is the only file anyone may touch by side effect (adding a dependency). On a lock conflict **never hand-merge**: take `main`'s lock, run `pnpm install`, commit.
- Database: every service owns its own schema. Change only your own `prisma/schema.prisma` (or SQL for agents). Other services read your tables by the column names in §4 — do not rename them.
- Python agents: dependencies only in your own `requirements.txt`.
- Merge order for integration (coding is parallel): **Dev 1's schema changes first** (columns/tables other services read), then Dev 2 and Dev 3 in any order, then Dev 4 swaps mocks for real APIs. Notification-service is fully testable only after the producers have merged.

## 3. Cross-cutting rules (everyone applies them inside their own apps)

1. **Event envelope.** Streams carry one field `data` = JSON. Every payload gets an optional `requestId` (uuid). If you receive an event with `requestId`, copy it into events you publish because of it; otherwise create one.
2. **Stream trimming.** Every `XADD` uses `MAXLEN ~ 10000`.
3. **Internal endpoints.** Every `/internal/*` handler requires header `x-internal-key: $INTERNAL_API_KEY` (skip the check when the env var is unset, for local dev). Every caller sends the header. Nginx keeps blocking `/internal/` from outside.
4. **Node stream consumers** you own reclaim idle pending messages (`XAUTOCLAIM`), retry, then dead-letter to `<stream>.dead`.
5. **Agent `/health`** returns 503 `{"status":"degraded"}` when a consumer thread has died (pattern: `matching-agent/app/main.py`).
6. **Roles** in JWT: `APPLICANT | COMPANY | ADMIN`.
7. Errors: Nest default error JSON (`{statusCode, message, error}`). Web shows `message`.
8. **Ops basics in every app you own:** `GET /health`; JSON-structured logs that include `requestId`; Swagger (`@nestjs/swagger`) at `/docs` only when `ENABLE_DOCS=true` (FastAPI `/docs` disabled with `ENABLE_DOCS=false`); `.env.example` with placeholders only.
9. **Reset scripts.** Every Nest app with Prisma has `db:reset` in `package.json` (drop and recreate its own schema using the method it already uses). Agents create their own helper tables at start-up (`ensure_*`).

## 4. Data contracts

### 4.1 Role requirements JSON (`jobs_service.JobRole.requirements`) — new keys optional; **absent/null = rule not set**
```json
{
  "title": "Backend Developer",
  "summary": "...",
  "requiredSkills": ["Java", "Spring"],
  "preferredSkills": ["Docker"],
  "minExperienceYears": 0,
  "qualifications": "B.Tech",
  "responsibilities": ["..."],
  "level": "fresher | experienced | any",
  "track": "backend",
  "stacks": ["java"],
  "minCgpa": 7.0,
  "allowedBranches": ["Computer Science", "Information Technology"],
  "passingYears": [2026, 2027],
  "maxBacklogs": 0
}
```
`track` and `stacks` come from the taxonomy (§4.10). `track: "other"` or missing = no gating. `stacks: []` or missing = any stack in that track.
Writers: jd-extractor-agent (extraction), job-service (manual create/update DTOs), web (role form). Readers: matching-agent, chatbot-agent, feedback-agent.

### 4.2 Parsed resume JSON (`resumes_service.Resume.parsedData`)
`currentTitle, summary, skills[], experience[], projects[], education, certifications[], cgpa, experienceYears` plus `branch` (string|null), `passingYear` (int|null), `backlogs` (int|null). Writers: resume-parser-agent; resume-service `PATCH` accepts them. Readers: matching-agent, web, chatbot-agent.

### 4.3 Applicant academic data (`users_service.ApplicantProfile`)
Columns: `cgpa Float?`, `branch String?`, `passingYear Int?`, `backlogs Int?`, `academicVerified Boolean @default(false)` (true = from admin CSV, locked for the applicant).

**Effective value (everyone uses exactly this rule):**
```
effective(field):
  if profile.academicVerified and profile[field] != null  -> {value: profile[field], source: "verified"}
  elif resume.parsedData[field] != null                    -> {value: resume.parsedData[field], source: "resume"}   # the resume being evaluated
  elif profile[field] != null                              -> {value: profile[field], source: "self"}
  else                                                     -> {value: null, source: "unknown"}
```
CGPA scale is 10; a value > 10 is treated as a percentage and divided by 10.

### 4.4 Company status (`users_service.CompanyProfile`)
`status String @default("approved")`: `pending | approved | rejected` (existing rows stay approved).

### 4.5 Auth (`auth_service`)
`User.isActive Boolean @default(true)`. Table `SystemSetting { key String @id, value Json }` with keys:
- `registrationMode`: `open | invite_only | domain` (default `open`). **College mode = `invite_only` (or `domain`); open mode = `open`.**
- `allowedDomains`: string[]
- `companyApprovalRequired`: bool (default `true`) — only matters when `registrationMode != invite_only`
- `jobApprovalRequired`: bool (default `false`)

### 4.6 Jobs (`jobs_service.JobPosting`)
`approvalStatus String @default("approved")` (`approved | pending | rejected`), `approvalNote String?`.

### 4.7 Matches (`matches_service`)
`Match` new columns: `shortlistInfo Json?`, `rejectReason String?`, `rejectMessage String?`, `prepGuide String?`, `rejectionFeedback String?`, `unverifiedRules String[] @default([])`. Existing `decision` stays (`shortlisted | rejected | null`). Unique `(applicantId, jobRoleId)` — **one match, hence one resume, per applicant and job role.**

`RoleScan` is now **one row per `(jobRoleId, resumeId)`** (unique): `applicantId, resumeId, jobRoleId, eligible, score, inputHash String?, scannedAt`. Dashboard numbers count **distinct applicants** (an applicant counts as matched/eligible if any of their resumes is eligible for that role).

### 4.8 Notifications (`notifications_service.Notification`, owned by notification-service)
`id, userId, type, title, body, data Json, dedupeKey String?, readAt, createdAt, expiresAt` (unique `userId + dedupeKey` when set; retention 90 days).

### 4.9 Resumes (`resumes_service.Resume`) — new columns
`targetTrack String`, `targetStack String` (both from the taxonomy §4.10), `targetKey String` (`"<track>:<stack>"`), `confirmedAt DateTime?`, `supersededAt DateTime?`.
- **Active resume** = `status = 'parsed' AND confirmedAt IS NOT NULL AND supersededAt IS NULL`. Every service that needs "the applicant's resume" uses this definition (never "latest parsed").
- At most **one active resume per `(applicantId, targetKey)`**, and at most **one unconfirmed upload per `(applicantId, targetKey)`** (a newer unconfirmed upload for the same key deletes the older unconfirmed one).
- At most 5 non-superseded resumes per applicant.
- Display label: `"Backend · Java"` (built by resume-service as `targetLabel`).

### 4.10 Taxonomy of target roles (single source of truth)
Language tracks (`frontend, backend, fullstack`) share language stack ids; other tracks have their own.
```json
{
  "tracks": [
    {"id": "frontend",     "label": "Frontend",          "stacks": ["javascript", "other"]},
    {"id": "backend",      "label": "Backend",           "stacks": ["java", "python", "javascript", "dotnet", "go", "php", "ruby", "other"]},
    {"id": "fullstack",    "label": "Full-stack",        "stacks": ["java", "python", "javascript", "dotnet", "php", "other"]},
    {"id": "mobile",       "label": "Mobile",            "stacks": ["android", "ios", "cross_platform", "other"]},
    {"id": "data_ml",      "label": "Data / ML / AI",    "stacks": ["data_analyst", "data_engineer", "ml_ai", "other"]},
    {"id": "devops_cloud", "label": "DevOps / Cloud",    "stacks": ["aws", "azure", "gcp", "general", "other"]},
    {"id": "qa",           "label": "QA / Testing",      "stacks": ["manual", "automation", "other"]},
    {"id": "other",        "label": "Other",             "stacks": []}
  ]
}
```
Stack ids are lower-case ids; labels for the UI are produced by the API (`java → Java`, `javascript → JavaScript / TypeScript (Node, React…)`, `dotnet → .NET / C#`, …).
`resume-service` owns the file `apps/resume-service/src/taxonomy/tech-roles.json` and serves it; `jd-extractor-agent` and `matching-agent` keep an identical copy (`app/taxonomy/tech_roles.json`); Dev 2 adds a check script that fails when the three differ.

### 4.11 Compatibility (target role gate) — used by matching-agent in SQL/code
```
compatible(resume, role):
  if resume.targetTrack == "other" or resume.targetStack == "other":      return true   # applicant opted out of gating
  if role.track is null or role.track == "other":                          return true
  language = {frontend, backend, fullstack}
  tracks_ok = (resume.targetTrack == role.track)
              or (resume.targetTrack in language and role.track in language and "fullstack" in {resume.targetTrack, role.track})
  if not tracks_ok: return false
  if role.stacks is empty:                                                  return true
  return resume.targetStack in role.stacks
```
(A full-stack resume can serve frontend/backend/full-stack roles; a frontend or backend resume can serve full-stack roles; frontend ↔ backend never match. Stack ids are compared as-is, so for language tracks `java` matches `java`.)

### 4.12 Input hash (skip re-scoring unchanged pairs)
`inputHash = sha1(canonical JSON of { resumeId, resume.parsedData, role.title + role.requirements, the effective academic values used by the role's rules (only if the role has any academic rule), scorer modelVersion })`.
matching-agent reads the stored `RoleScan.inputHash` for `(jobRoleId, resumeId)`; equal → skip the pair entirely (no scoring, no event). `match.scanned` entries carry `inputHash`.

## 5. HTTP contracts (nginx paths)

### 5.1 auth-service (Dev 1)
| Method path | Who | Body → response |
|---|---|---|
| `GET /auth/registration-mode` | public | → `{ mode, allowedDomains }` |
| `POST /auth/signup` | public | as today; **403** `{message}` when mode is `invite_only`, or `domain` and the email domain is not allowed. Company profile status: `pending` only if `registrationMode != invite_only` **and** `companyApprovalRequired`; otherwise `approved` |
| `GET /auth/admin/settings` | ADMIN | → `{ registrationMode, allowedDomains, companyApprovalRequired, jobApprovalRequired }` |
| `PUT /auth/admin/settings` | ADMIN | same body → same |
| `POST /auth/admin/users/import` | ADMIN | `{ users: [{ email, role: "APPLICANT"\|"COMPANY", name?, cgpa?, branch?, passingYear?, backlogs? }] }` → `{ created: [{email, id}], skipped: [{email, reason}] }` (web parses the CSV; max 500 rows; imported companies are `approved`) |
| `PATCH /auth/admin/users/:id/active` | ADMIN | `{ active }` → `{ id, isActive }` (deactivating deletes refresh tokens; login → 401 "Account disabled") |
| `DELETE /auth/admin/users/:id` | ADMIN | → `{ deleted: true }` |
| `GET /internal/settings` | internal | → `{ registrationMode, allowedDomains, companyApprovalRequired, jobApprovalRequired }` |

Imported users get a random password and an email job `password-reset` with `invite: true`.
`POST /internal/profiles` (user-service) receives `{ userId, role, email, name?, companyStatus: "pending"|"approved", academic?: {cgpa, branch, passingYear, backlogs}, academicVerified?: boolean }`.

### 5.2 user-service (Dev 1)
| Method path | Who | Notes |
|---|---|---|
| `GET /applicants/me` | APPLICANT | adds `cgpa, branch, passingYear, backlogs, academicVerified`; creates the profile row if missing |
| `PATCH /applicants/me` | APPLICANT | accepts the four academic fields; ignores them when `academicVerified`; publishes `profile.updated` when one changed |
| `GET /companies/me` | COMPANY | adds `status` |
| `GET /admin/applicants` | ADMIN | items add `email, isActive, cgpa, branch, passingYear, backlogs, academicVerified` |
| `GET /admin/companies` | ADMIN | items add `email, isActive, status` |
| `PATCH /admin/companies/:userId/status` | ADMIN | `{ status }`; publishes `company.status.changed`; audit entry |
| `GET /admin/health` | ADMIN | → `{ streams: [{ name, length, deadLength }] }` |
| `GET /admin/audit?limit=50` | ADMIN | → `[{ id, actorId, action, target, meta, createdAt }]` |
| `GET /internal/companies/:userId/status` | internal | → `{ status }` |
| `POST /internal/audit` | internal | `{ actorId, action, target, meta? }` |

Avatars: when a new avatar replaces an old one, the old Cloudinary file is deleted.

### 5.3 notification-service (Dev 1) — nginx adds `/notifications/` → `:3006`
`GET /notifications?limit=20&cursor=<id>&unread=1` → `{ items, nextCursor }` · `GET /notifications/unread-count` → `{ count }` · `PATCH /notifications/:id/read` · `PATCH /notifications/read-all`.
`Notification` = `{ id, type, title, body, data, readAt, createdAt }`; any role; own rows only.

### 5.4 resume-service (Dev 2) — nginx `/resumes/`
| Method path | Who | Behaviour |
|---|---|---|
| `GET /resumes/target-roles` | any authenticated role | → `{ "tracks": [ { "id", "label", "stacks": [ { "id", "label" } ] } ] }`: the taxonomy of §4.10 with a label for every stack (also used by the company role form). Track `other` has `stacks: []` |
| `POST /resumes/upload` | APPLICANT | multipart `file` + `targetTrack` + `targetStack` (both required; the stack must belong to the track, or be `other`, which every track accepts and which the web sends for the track `other`). 409 when the applicant already has 5 non-superseded resumes. A pending unconfirmed upload with the same `targetKey` is deleted first (file + row) |
| `GET /resumes/mine` | APPLICANT | all resumes with `targetTrack, targetStack, targetLabel, status, confirmedAt, supersededAt` |
| `PATCH /resumes/:id` | APPLICANT | edit parsed data; edit `targetTrack/targetStack` **only while unconfirmed**. Publishes `resume.updated` only if the resume is confirmed |
| `POST /resumes/:id/confirm` | APPLICANT | resume must be `parsed` with ≥1 skill, else 400. Sets `confirmedAt`; if an active resume with the same `targetKey` exists it is **replaced** in the same transaction (section "Storage" below). Publishes `resume.confirmed` (+ `resume.superseded`) |
| `DELETE /resumes/:id` | APPLICANT | 409 if an approved match uses it; otherwise removes it completely. Publishes `resume.deleted` if it was active |
| `GET /resumes/:id/pdf` | COMPANY/ADMIN | unchanged (signed 15-minute link, approved matches only) |

**Storage (Cloudinary is kept clean):**
- *Replace on confirm:* the replaced resume is deleted completely — Cloudinary original **and** generated PDF, its `resume_embeddings` row, and the DB row — **unless** an approved match still uses it; then only `supersededAt` is set and the files stay.
- *Daily cleanup job* (resume-service): (a) delete superseded resumes no approved match references any more (file, PDF, embedding, row; publish `resume.deleted`), (b) delete uploads that were never confirmed (pending/failed/parsed-unconfirmed) older than `UNCONFIRMED_RESUME_TTL_DAYS` (default 14).
- *Delete endpoint* uses the same removal routine. Cloudinary calls use the correct `resource_type` (raw/image) and `invalidate: true`.
- "Approved match uses it" = `matches_service.Match` with that `resumeId` and `applicantStatus = 'approved'` (read-only SQL).

### 5.5 job-service (Dev 3)
- `POST /jobs/upload`, `POST /jobs/:id/roles`: **403** `{message: "Company is not approved yet"}` unless `GET user-service /internal/companies/:id/status` says `approved` (cache 60 s; fail closed with a clear 503).
- Role DTOs accept every requirement key of §4.1 (including `track`, `stacks` validated against the taxonomy ids).
- `GET /jobs/mine` items add `approvalStatus`.
- If `jobApprovalRequired` (from `GET auth-service /internal/settings`, cache 60 s) is true a new posting is `pending` and `jd.uploaded` is not published until approved. `GET /jobs/admin/pending` (ADMIN), `PATCH /jobs/admin/:id/approval` (ADMIN) `{ approved, note? }` → on approve publishes `jd.uploaded`; always publishes `job.approval.changed`.

### 5.6 matching-results-service (Dev 3)
`PATCH /matches/:id/decision` (COMPANY; approved candidates of own roles only):
```json
{ "decision": "shortlisted",
  "shortlist": { "roundName": "Technical round 1", "mode": "online|offline|phone",
                 "scheduledAt": "ISO date?", "bring": "string?", "link": "string?", "address": "string?", "note": "string?" } }
{ "decision": "rejected",
  "rejection": { "reasonCategory": "skills_gap|experience|resume_quality|position_filled|other", "message": "string?" } }
{ "decision": null }
```
`roundName`, `mode` required for shortlist; `reasonCategory` required for reject.
- `GET /matches/mine` (APPLICANT): adds `outcome` (`shortlisted|rejected|null`), `shortlistInfo`, `prepGuide`, `rejectionMessage`, `rejectionFeedback`, `unverifiedRules[]`, `resumeId`, `resumeTargetLabel`. Never exposes `rejectReason` or `decidedBy`.
- `GET /matches/role/:jobRoleId` (COMPANY): adds `decision`, `shortlistInfo`, `rejectReason`, `rejectMessage`, `unverifiedRules[]`, `resumeTargetLabel`.
- `GET /stats/company`: adds `shortlisted`, `rejected`. `GET /stats/admin`: same plus `byBranch: [{ branch, scanned, matched, applied, shortlisted }]` (effective branch, §4.3).

**Replacement rule when a match already exists for `(applicantId, jobRoleId)`** (applied in `saveMatchResult`):
1. `applicantStatus = approved` → only refresh when `resumeId` is the same; otherwise ignore (the shared resume is frozen).
2. otherwise replace if: no existing row, **or** same `resumeId`, **or** new score > existing score, **or** the existing resume is no longer active (superseded/deleted — read `resumes_service.Resume`).
3. else keep the existing row.
On `resume.superseded` / `resume.deleted`: delete the **non-approved** `Match` rows and **all** `RoleScan` rows of that `resumeId`.

### 5.7 chatbot-agent (Dev 3) — internal `POST /chat`; applicant context uses the **match's resume** (`Match.resumeId`), company context per Spec §9.7.

## 6. Event contracts

| Stream | Producer → Consumers | Payload (`data`) |
|---|---|---|
| `resume.parsed` | resume-parser → ws, notification | existing payload (+ `branch, passingYear, backlogs`). **Does not trigger matching.** |
| `resume.confirmed` | resume-service → matching-agent | `{ resumeId, applicantId, targetTrack, targetStack }` — the matching trigger |
| `resume.updated` | resume-service → matching-agent | as before, only for confirmed resumes |
| `resume.superseded` | resume-service → results-service | `{ resumeId, applicantId }` |
| `resume.deleted` | resume-service → results-service, matching-agent | `{ resumeId, applicantId }` |
| `profile.updated` | user-service → matching-agent | `{ applicantId }` |
| `match.computed` | matching-agent → results, feedback, ws, notification | existing + `unverifiedRules: string[]` (names among `cgpa, branch, passingYear, backlogs`); failed rules appear in `reason` and `breakdown.gatesFailed` |
| `match.scanned` | matching-agent → results | `{ scans: [{ jobRoleId, applicantId, resumeId, eligible, score, inputHash }] }` (chunked) |
| `candidate.ready` | results → ws, notification | `{ companyId, matchId, jobRoleId, roleTitle, applicantName, score }` |
| `candidate.shortlisted` | results → feedback-agent, notification, ws | `{ matchId, applicantId, jobRoleId, companyId, roleTitle, companyName, shortlist }` |
| `candidate.rejected` | results → feedback-agent, notification, ws | `{ matchId, applicantId, jobRoleId, companyId, roleTitle, reasonCategory, message? }` |
| `prep.ready` | feedback-agent → results, notification, ws | `{ matchId, applicantId, jobRoleId, guide }` |
| `rejection-feedback.ready` | feedback-agent → results, notification, ws | `{ matchId, applicantId, jobRoleId, feedback: string\|null }` (`null` for `position_filled`/`other`) |
| `company.status.changed` | user-service → notification, ws | `{ companyId, status }` |
| `job.approval.changed` | job-service → notification, ws | `{ companyId, jobPostingId, status, note? }` |
| `notification.created` | notification → ws | `{ userId, notification }` |

Unchanged streams are in Spec §7. matching-agent consumes `resume.confirmed, resume.updated, profile.updated, jd.extracted, job.role.deleted, resume.deleted` (**not** `resume.parsed`). The websocket gateway routes by `data.applicantId \|\| data.companyId \|\| data.userId`.

## 7. Notification policy (implemented by notification-service, Dev 1)

| Event | Recipient | In-app type | Email |
|---|---|---|---|
| `resume.parsed` | applicant | `resume_ready` — "Review and confirm your resume" | no |
| `jd.extracted` | company | `roles_ready` | no |
| `match.computed` with `eligible = true` | applicant | `match_eligible` | **yes** — first time only (`dedupeKey = matchKey`) |
| `match.computed` with `eligible = false` | — | none | no |
| `feedback.ready` | applicant | `feedback_ready` | no |
| `candidate.ready` | company | `candidate_ready` | **yes** |
| `candidate.shortlisted` | applicant | `shortlisted` | **yes** — company details verbatim |
| `prep.ready` | applicant | `prep_ready` | no |
| `candidate.rejected` | applicant | `rejected` | no |
| `rejection-feedback.ready` | applicant | `rejection_feedback_ready` (only when `feedback` not null) | no |
| `company.status.changed` | company | `company_status` | no |
| `job.approval.changed` | company | `job_approval` | no |
| password reset / invite | user | — | **yes** (`password-reset` job; `invite: true` for imports) |

matching-results-service enqueues **no** emails. The only producer of `email-queue` is auth-service; notification-service enqueues its own email jobs after writing a notification.

## 8. Efficient matching — rules every matching change must respect
1. **Gate first.** Candidate selection filters by compatibility (§4.11) and by active resumes / non-stopped roles **in SQL, before** vector search, so top-K is chosen among compatible items only.
2. **Best first, stop early.** Vector search (pgvector, HNSW index) returns candidates ordered by similarity; score them in batches (default 25); stop when two consecutive batches yield no eligible candidate, or when `MAX_ELIGIBLE_PER_ROLE` (default 200) eligible were found, or at `TOP_K_*`.
3. **Cheap prefilter before expensive scoring:** skip a pair only if exact (alias-normalised) required-skill coverage is 0 **and** profile cosine similarity is below `PREFILTER_MIN_COSINE`; Dev 2 must prove on the gold set that recall does not drop (> 1 point) before enabling it.
4. **Skip unchanged pairs** with `inputHash` (§4.12).
5. **Cache** the embedded "resume side" per `(resumeId, content hash)` and the "role side" per `(roleId, content hash)` in an in-process LRU (default 2000 entries).
6. **Best resume per (applicant, role)**: within one run, publish only the best-scoring resume per applicant and role; results-service applies the replacement rule (§5.6).
7. Log per run: retrieved, gated out, prefiltered, skipped by hash, scored, eligible, milliseconds; expose them in `GET /stats` of matching-agent.
Trigger rules: `resume.confirmed/updated` → that resume vs compatible roles; `jd.extracted` → compatible active resumes vs the new/edited role; `profile.updated` → that applicant's active resumes vs roles with academic rules; `resume.deleted` → the applicant's remaining active resumes vs the roles the deleted resume had been scanned against.

## 9. Integration checkpoints (Dev 4 runs them when branches are merged; automated in `e2e/`)
1. Open mode, `companyApprovalRequired = true`: company signs up → pending → cannot upload → admin approves → can upload. Switch the setting off → a new company is active immediately.
2. College mode (`invite_only`): signup returns 403; admin imports a CSV → user sets a password → logs in; academic fields locked; imported company active at once.
3. Upload a resume with a target role → parsed, **no match yet** → confirm → matches appear. Role with `minCgpa` and unknown CGPA → eligible with an "unverified" flag.
4. A Python-Backend resume never gets matched against a role with `track=backend, stacks=[java]`; a Java-Backend resume does.
5. Second resume for another target role → both active; each job role is matched with the better compatible resume and the applicant sees which one.
6. New resume for the same target role confirmed → old one removed from DB and Cloudinary (original + PDF); its non-approved matches recomputed; if an approved match used the old one, its files stay and the company can still download the PDF.
7. Delete a resume used by an approved match → 409.
8. Applicant approves → company sees candidate → shortlists with the form → applicant gets email + notification, later "prep ready".
9. Company rejects with `skills_gap` → in-app feedback; with `position_filled` → only the polite message.
10. Notification bell updates live; unread count and mark-read work.
11. Re-sending the same event or touching an unchanged resume does not re-score pairs (check matching-agent `/stats`: skipped-by-hash > 0).
12. Admin health page shows stream lengths and dead-letter counts; audit log shows approvals.
13. Fresh database: `pnpm db:reset:all` then `pnpm seed` → admin can log in with the env credentials.

## 10. Docker — LAST PHASE (start only after everything above is merged and the checkpoints pass)
Goal: the whole stack starts with one command locally and in CI. (Hosting/deployment is not part of this phase.)
- **Every owner** adds inside their own app folders: `Dockerfile` and `.dockerignore`.
  - NestJS apps: multi-stage build with pnpm (`pnpm install --frozen-lockfile`, `prisma generate`, `nest build`), run `node dist/main`, non-root user, `HEALTHCHECK` on `GET /health`, entrypoint applies the app's schema (same method as local) before start.
  - Python agents: slim image, `pip install -r requirements.txt`, `uvicorn app.main:app --host 0.0.0.0 --port 8000`, `HEALTHCHECK` on `/health`. `resume-parser-agent` and `jd-extractor-agent` install Tesseract; the parser also LibreOffice. `matching-agent` downloads the embedding model at build time and mounts `app/artifacts/` read-only.
  - `apps/web`: multi-stage `next build`, `next start`.
- **Dev 1 (`infra/nginx`):** `nginx.docker.conf` with compose service names (e.g. `proxy_pass http://auth-service:3001;`), `/internal/` → 404, `/socket.io/` upgrade, `/notifications/`, and `/` → `web:3000` so the browser has one origin.
- **Dev 4:** `docker-compose.yml` + `.env.compose.example`: `postgres` (pgvector image), `redis`, 8 Nest apps, 5 agents, `web`, `nginx`; one internal network, **only nginx publishes a port (80)**; `depends_on` with health conditions; shared `JWT_SECRET`, `INTERNAL_API_KEY`, `DATABASE_URL`, `REDIS_URL`; `CHATBOT_AGENT_URL=http://chatbot-agent:8000`; `SEED_ADMIN_ON_BOOT=true`; Gmail transport with `EMAIL_DEV_REDIRECT_TO` for local; profile `e2e` runs `e2e/` in CI; README "Run with Docker".
- Acceptance: `docker compose up --build` on a clean machine → admin logs in, an applicant registers, uploads, confirms and gets a match; the e2e suite passes inside compose.

## 11. Ops checklist (not code; one person ticks it before real users)
- Resend: verify your own sending domain (SPF/DKIM) and set `EMAIL_FROM`; the test sender works only for testing.
- Postgres/Supabase: `CREATE EXTENSION vector`; all schemas present.
- Cloudinary folders and private delivery settings; Groq key and plan limits (many students uploading at once will hit free-tier limits — decide when deployment is planned).
- Secrets only in env files; `secret-scan` workflow stays green.
- Admin credentials come from `ADMIN_EMAIL` / `ADMIN_PASSWORD` (seed script); change the password after first login.
