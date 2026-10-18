# feedback-agent

Writes the AI texts the applicant reads, with Groq (`openai/gpt-oss-120b`). It decides nothing: matching is done by the
matching-agent and decisions by the company. Three streams in, three streams out:

```
match.computed (not eligible, score >= 0.2) ──▶ improvement guide ──────────▶ feedback.ready
candidate.shortlisted ──────────────────────▶ interview prep guide ────────▶ prep.ready
candidate.rejected ─ skills_gap | experience | resume_quality ─▶ feedback ──▶ rejection-feedback.ready
                   └ position_filled | other ────────────────▶ feedback: null ▶ rejection-feedback.ready
```
matching-results-service stores the texts (`feedback`, `prepGuide`, `rejectionFeedback`); notification-service uses the events.

| file | job |
|---|---|
| `workers/stream_consumer.py` | the three handlers, the read-only SQL, one consumer thread per stream |
| `services/gap_analyzer.py` | not-eligible guide (level, rules, effective academics, `unverifiedRules`) |
| `services/prep_guide.py` | prep guide for a shortlisted candidate |
| `services/rejection_feedback.py` | feedback for a rejected candidate |
| `services/academics.py` | effective cgpa / branch / passingYear / backlogs (verified > resume > self, contract 4.3) |
| `services/safety.py` | checks on generated text: invented dates / links, talk about other applicants, job promises |
| `core/redis_stream.py` | consume loop: retry, reclaim idle messages (XAUTOCLAIM), dead-letter; `publish` adds `MAXLEN ~ 10000` + `requestId` |
| `core/health_state.py` | consumer registry read by `/health` |
| `core/logging_setup.py` | JSON logs |
| `core/llm_client.py` | Groq calls: pacing, retries with back-off |

## Run

```bash
pip install -r requirements.txt
cp .env.example .env          # fill in DATABASE_URL, REDIS_URL, GROQ_API_KEY
uvicorn app.main:app --port 8004
python -m unittest discover -s tests -t .
```
8004 is the suggested port: use the same one as `PORT` and in the uvicorn command. The tests use a stub LLM and fake database / Redis: no network, no API key.

## Environment

| Variable | Required | Default | Meaning |
|---|---|---|---|
| `DATABASE_URL` | yes | - | Postgres (read-only queries on `jobs_service`, `resumes_service`, `matches_service`, `users_service`) |
| `REDIS_URL` | no | `redis://localhost:6379` | Redis for the event streams |
| `GROQ_API_KEY` | yes | - | Groq key |
| `PORT` | no | `8000` (suggested `8004`) | port |
| `LOG_LEVEL` | no | `INFO` | log level |
| `ENABLE_DOCS` | no | `false` | `true` serves FastAPI `/docs` |
| `ENABLE_FEEDBACK_CONSUMER` | no | `true` | `false` = HTTP only, no consumers (`/health` stays 200) |

This agent has no `/internal/*` endpoints, so there is no `x-internal-key` check.

## HTTP

`GET /health` (also `/`): `200 {"status":"ok", ...}`, or `503 {"status":"degraded", "errors": {...}}` when the consumers failed to start or a
consumer thread died.

## Events

Every payload is JSON in one field `data` with an optional `requestId`. Consumer group: `feedback-agent-group`.

| Consumes | Needs | Publishes |
|---|---|---|
| `match.computed` | `resumeId` (the resume that was scored, never "the latest"), `reason`, skills, `unverifiedRules` | `feedback.ready {applicantId, jobRoleId, feedback}` |
| `candidate.shortlisted` | `matchId`, `shortlist.roundName`, `shortlist.mode` | `prep.ready {matchId, applicantId, jobRoleId, guide}` |
| `candidate.rejected` | `matchId`, `reasonCategory` | `rejection-feedback.ready {matchId, applicantId, jobRoleId, feedback \| null}` |

## Rules for the generated texts

- **The match's resume.** The advice is about the resume the match was computed on (`Match.resumeId`), read together with `applicantId`.
- **Current decisions only.** `prep.ready` / `rejection-feedback.ready` are written only while the match is still shortlisted / rejected.
  A missing match, a match of another applicant or a deleted role is skipped.
- **Nothing invented.** No dates, times, weekdays, places, links, interviewers or process details, and no job promises. The company's own
  details (date, link, address, note, message) are shown to the candidate by other services and are never sent to the model. Output that breaks
  this is retried once, then fails like any other error (retry, then `<stream>.dead`).
- **No guessing the company's reasons.** For a rejection the category only chooses the focus area (skills / experience / resume clarity). The
  text never says or implies what the company decided or why, and never mentions other applicants.
- **Anonymous benchmark.** The "selected" benchmark contains only skills, years of experience and education of strong profiles for the role,
  taken from each match's own resume. Never projects, employers or free text.
- **Data is data.** Resume and role text can contain instructions; the prompts tell the model to ignore them.
- **Reliability.** Each message gets up to 4 deliveries (idle messages are reclaimed after 60 s), then goes to `<stream>.dead` and is acknowledged.
  Every `XADD` uses `MAXLEN ~ 10000`; `requestId` is copied from the event being handled or created. Logs are one JSON line per message:
  `ts, level, service, requestId, msg` (no resume text, no e-mails).
