# jd-extractor-agent

FastAPI agent. Turns an uploaded job-description document into one or more **roles** with structured requirements, and stores a role embedding for matching.

## Purpose
`jd.uploaded` → download the document → extract text (PDF, DOCX, TXT, image OCR) → Groq LLM → pydantic validation → in **one DB transaction** (under a row lock) insert `JobRole` rows + `job_role_embeddings`, set the posting `extracted` → `jd.extracted`.
- Stopped postings and already-extracted ones are skipped; if the company stops the job while the LLM is reading, the result is discarded.
- Role requirements (contract §4.1): `title, summary, requiredSkills, preferredSkills, minExperienceYears, salaryMin / salaryMax / salaryCurrency / salaryPeriod (only when the document states a salary; full numbers, never invented), maxExperienceYears (only when the document states a range or limit, e.g. "2-4 years" -> 2 and 4; the company confirms it), qualifications, responsibilities, seniority, location, employmentType` plus `level` (`fresher | experienced | any`), `track` and `stacks[]` (taxonomy ids), and the academic rules `minCgpa, allowedBranches, passingYears, maxBacklogs`.
- `track` / `stacks` come from `app/taxonomy/tech_roles.json` (identical copy of `resume-service/src/taxonomy/tech-roles.json`; a test fails when copies differ). Unsure or unknown track → `other`; unknown stack ids are dropped; `stacks: []` means any stack in that track.
- The academic rules are **null unless the document states them**. The prompt says so, and a safety net in code (`jd_rules.py`) also drops a rule that has no evidence in the text. `minCgpa` is on a 10-point scale (`60%` → 6.0).
- The document text is treated as data. The prompt tells the model to ignore instructions inside it. No document text is logged.
- The role embedding text is built by `app/services/profile_text.py` — the same builder as matching-agent (change both together).

## Port
8002 (suggested): `uvicorn app.main:app --port 8002`

## Routes
| method | path | role | notes |
|---|---|---|---|
| GET | `/health` (also `/`) | none | 200 `ok`; **503 `degraded`** when the consumer failed to start or its thread died |
| GET | `/docs` | none | only when `ENABLE_DOCS=true` |

## Events
| stream | direction | payload |
|---|---|---|
| `jd.uploaded` | consumed (group `jd-extractor-group`) | `{ jobPostingId, companyId, fileUrl, requestId? }` |
| `jd.extracted` | produced | `{ jobPostingId, companyId, roleIds, requestId }` |

Every `XADD` uses `MAXLEN ~ 10000`. `requestId` from an incoming event is copied into the event published because of it, otherwise a new one is created. Idle pending messages are reclaimed, retried 4 times, then moved to `jd.uploaded.dead` (the posting is marked `failed`).

## Database
Writes `jobs_service."JobRole"` and `"JobPosting"` (`status`, `errorMessage`) and its own table `job_role_embeddings` (created at start-up).

## Environment variables
| name | required | example | meaning |
|---|---|---|---|
| `PORT` | no | `8002` | port (use the same in the uvicorn command) |
| `DATABASE_URL` | yes | `postgresql://user:pass@localhost:5432/db` | Postgres with pgvector |
| `REDIS_URL` | no | `redis://localhost:6379` | Redis streams |
| `GROQ_API_KEY` | yes | `gsk_...` | LLM key |
| `GROQ_MODEL` | no | `openai/gpt-oss-120b` | LLM model name |
| `GROQ_REASONING_EFFORT` | no | `low` | `low` / `medium` / `high` (gpt-oss only) |
| `TESSERACT_PATH` | no | `C:\Program Files\Tesseract-OCR\tesseract.exe` | OCR for image documents |
| `LOG_LEVEL` | no | `INFO` | JSON logs: `ts, level, service, requestId, msg` |
| `ENABLE_DOCS` | no | `false` | `/docs` only when `true` |
| `ENABLE_JD_EXTRACTOR_CONSUMER` | no | `true` | run the `jd.uploaded` consumer |

## Run locally
```
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --port 8002
```

## Test
```
python -m unittest discover -s tests -t . -v
```
Redis, DB, Groq and the document readers are faked; no network is needed.

## Depends on
Postgres (pgvector), Redis, Groq, job-service (uploads the document, owns the `JobPosting` / `JobRole` tables), matching-agent (consumes `jd.extracted`).