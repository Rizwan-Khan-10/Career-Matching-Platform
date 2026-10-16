# resume-parser-agent

FastAPI agent. Turns an uploaded resume file into structured data + an embedding, and makes a PDF of the resume for approved matches.

## Purpose
- `resume.uploaded` → download file → extract text (PDF, DOCX, TXT, image OCR) → Groq LLM → pydantic validation → `parsedData` + 384-dim embedding → `resume.parsed`.
- `match.approved` → make sure a PDF of the resume exists → `resume.pdf.ready` / `resume.pdf.failed`.
- `resume.parsed` only tells the UI / notification-service that the resume is ready to **review and confirm**. It does **not** start matching (matching starts at `resume.confirmed`, published by resume-service).
- The resume text is treated as data. The prompt tells the model to ignore instructions inside it. No resume text is logged.

## Port
8001 (suggested): `uvicorn app.main:app --port 8001`

## Routes
| method | path | role | notes |
|---|---|---|---|
| GET | `/health` (also `/`) | none | 200 `ok`; **503 `degraded`** when a consumer failed to start or its thread died |
| GET | `/docs` | none | only when `ENABLE_DOCS=true` |

## Events
| stream | direction | payload |
|---|---|---|
| `resume.uploaded` | consumed (group `resume-parser-group`) | `{ resumeId, applicantId, fileUrl, requestId? }` |
| `match.approved` | consumed (group `resume-pdf-group`) | `{ matchId, applicantId, jobRoleId, resumeId?, requestId? }` |
| `resume.parsed` | produced | `{ resumeId, applicantId, currentTitle, summary, skills, experience, projects, education, certifications, cgpa, branch, passingYear, backlogs, experienceYears, requestId }` |
| `resume.pdf.ready` | produced | `{ matchId, resumeId, applicantId, jobRoleId, pdfPublicId, fileName, requestId }` |
| `resume.pdf.failed` | produced | `{ matchId, applicantId, jobRoleId, reason, requestId }` |

- `branch`, `passingYear`, `backlogs` are `null` when the resume does not state them (never invented). `cgpa` is normalised to a 10-point scale (`8.2/10` → 8.2, `3.8/4` → 9.5, `85%` → 8.5).
- If `match.approved` has no `resumeId`, the applicant's **active** resume is used (`status = 'parsed' AND confirmedAt IS NOT NULL AND supersededAt IS NULL`, most recently confirmed first).
- PDF id: `resumes/<applicantId>/pdf/<resumeId>.pdf` (a resume that already is a PDF is reused as is).
- Every `XADD` uses `MAXLEN ~ 10000`. `requestId` from an incoming event is copied into the events published because of it, otherwise a new one is created. Idle pending messages are reclaimed, retried 4 times, then moved to `<stream>.dead`.

## Database
Writes `resumes_service."Resume"` (`status`, `parsedData`, `pdfPublicId`) and its own table `resume_embeddings` (created at start-up). Reads `resumes_service."Resume"` only otherwise.

## Environment variables
| name | required | example | meaning |
|---|---|---|---|
| `PORT` | no | `8001` | port (use the same in the uvicorn command) |
| `DATABASE_URL` | yes | `postgresql://user:pass@localhost:5432/db` | Postgres with pgvector |
| `REDIS_URL` | no | `redis://localhost:6379` | Redis streams |
| `GROQ_API_KEY` | yes | `gsk_...` | LLM key |
| `GROQ_MODEL` | no | `openai/gpt-oss-120b` | LLM model name |
| `GROQ_REASONING_EFFORT` | no | `low` | `low` / `medium` / `high` (gpt-oss only) |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | yes (PDF consumer) | — | same Cloudinary account as resume-service |
| `TESSERACT_PATH` | no | `C:\Program Files\Tesseract-OCR\tesseract.exe` | OCR for image resumes |
| `SOFFICE_PATH` | no | `soffice` | LibreOffice for DOCX/RTF/ODT → PDF |
| `SOFFICE_TIMEOUT_SECONDS` | no | `120` | conversion timeout |
| `PDF_MAX_INPUT_BYTES` | no | `15728640` | max file size converted |
| `LOG_LEVEL` | no | `INFO` | JSON logs: `ts, level, service, requestId, msg` |
| `ENABLE_DOCS` | no | `false` | `/docs` only when `true` |
| `ENABLE_RESUME_PARSER_CONSUMER` | no | `true` | run the `resume.uploaded` consumer |
| `ENABLE_RESUME_PDF_CONSUMER` | no | `true` | run the `match.approved` consumer |

## Run locally
```
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --port 8001
```

## Test
```
python -m unittest discover -s tests -t . -v
```
Redis, DB, Groq, Cloudinary and the embedding model are faked; no network is needed.

## Depends on
Postgres (pgvector), Redis, Groq, Cloudinary, resume-service (uploads the file, owns the `Resume` table), matching-results-service (consumes the PDF events).