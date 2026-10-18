# chatbot-agent

The AI assistant behind the chat. It answers one question at a time, using ONLY a context it builds from the database for the
calling user, and the Groq model `openai/gpt-oss-120b`. It decides nothing and stores nothing.

Only `chat-service` calls it (plain HTTP, `POST /chat`). nginx does not route to it, so keep it on the internal network.
`chat-service` takes `userId`, `role` and `jobRoleId` from the verified JWT and the conversation owner, never from the message text.

## Run

```bash
pip install -r requirements.txt
cp .env.example .env          # fill in DATABASE_URL and GROQ_API_KEY
uvicorn app.main:app --port 8005
python -m unittest discover -s tests -t .
```

8005 is the suggested local port: use the same one as `PORT` and in the uvicorn command (in Docker the agent listens on 8000).
The tests use a fake database and a fake LLM: no network, no API key.

## Environment

| Variable | Required | Default | Meaning |
|---|---|---|---|
| `DATABASE_URL` | yes | - | Postgres, read-only queries on `resumes_service`, `matches_service`, `jobs_service`, `users_service` |
| `GROQ_API_KEY` | yes | - | Groq key |
| `PORT` | no | `8000` (suggested `8005`) | port |
| `REDIS_URL` | no | `redis://localhost:6379` | not used by this agent |

## HTTP

`GET /health` -> `200 {"status": "ok"}`.

`POST /chat`

```json
{ "userId": "…", "role": "APPLICANT | COMPANY", "message": "…", "jobRoleId": "… (applicant only, optional)",
  "history": [ { "sender": "user | bot", "content": "…" } ] }
```

Answer `200 {"reply": "…"}`. Any failure (database, Groq, empty answer) is `502 {"detail": "assistant unavailable"}`: the real error is only logged.
`history` is the last turns, at most 60 and cut to 20 here; the new message may or may not already be its last entry.

## What the assistant knows

Everything below is scoped by the calling user, and the model is told to treat it as data, never as instructions.

**Applicant** (`get_context_for_applicant`)

| Context key | Content |
|---|---|
| `resume`, `resumeTarget` | the parsed resume the match was computed on (`Match.resumeId`, even if replaced later) and its label, e.g. `Backend · Java`. No role / no match / resume gone: the applicant's best active resume (parsed, confirmed, not superseded; the one confirmed last) |
| `matches[]` | for the role, or the best 20 without a role: `score`, `eligible`, `reason`, `matchedSkills`, `partialSkills`, `missingSkills`, `feedback` |
| `matches[].outcome` | `shortlisted`, `rejected` or `null` (not decided) |
| `matches[].shortlistInfo`, `prepGuide` | only when shortlisted: the company's round details (quoted exactly) and the AI prep tips |
| `matches[].rejectionFeedback` | only when rejected: the AI improvement feedback |
| `matches[].unverifiedRules` | campus rules (`cgpa`, `branch`, `passingYear`, `backlogs`) that could not be checked because the value is unknown |
| `role` | title and requirements of the role |

Never: the company's reject reason or message, who decided, other applicants, other companies.

**Company** (`get_context_for_company`): its roles with requirements, the dashboard counts (scanned, matched, applied, shortlisted, rejected),
the best candidates who approved sharing (name, score, skills, decision, `unverifiedRules`, resume target) and a glossary. Never resume text or files,
contact details, applicants who did not approve, or the reasons behind decisions.

## Files

| file | job |
|---|---|
| `app/api/chat.py` | `POST /chat`: picks the context by role, asks the model, maps errors to 502 |
| `app/services/rag_service.py` | the read-only SQL and the two contexts |
| `app/services/chat_responder.py` | the two system prompts, message building, the Groq call |
| `app/services/target_label.py` | `Backend · Java` style labels (same text as resume-service) |
| `app/core/llm_client.py` | Groq calls: pacing, retries with back-off |
| `tests/` | `test_company_context.py`, `test_applicant_context.py` |
