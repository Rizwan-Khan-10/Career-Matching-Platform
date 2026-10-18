# chat-service

The chat of the platform. An applicant gets one conversation per match and talks to the assistant about that job; a company
asks quick questions about its own roles and candidates. The answers come from `chatbot-agent`; this service stores the
conversations, checks who may talk, and limits how much one user can ask. Port **3008**, schema `chat_service`.
nginx routes `/chat/*` here.

## Run

```bash
pnpm install
cp apps/chat-service/.env.example apps/chat-service/.env   # fill in the values
pnpm --filter chat-service exec prisma generate
pnpm --filter chat-service db:push
pnpm --filter chat-service start:dev
```

| Command (`pnpm --filter chat-service ...`) | What it does |
|---|---|
| `test` | unit tests (Prisma, Redis and the other services are mocked) |
| `lint` | oxlint |
| `build` | `nest build` (this is what CI runs) |
| `db:push` | `prisma db push` (there is no migrations folder) |
| `db:reset` | drops and recreates **only** the `chat_service` schema, then `db push`. Stop the service first. Refuses `NODE_ENV=production` unless `ALLOW_DB_RESET=true` |

## Environment

| Variable | Required | Default | Meaning |
|---|---|---|---|
| `DATABASE_URL` | yes | - | Postgres connection string |
| `JWT_SECRET` | yes | - | must be identical in every service (the service stops at start-up with a clear error when missing) |
| `CHATBOT_AGENT_URL` | yes | - | base URL of chatbot-agent (`POST /chat`) |
| `MATCHING_SERVICE_URL` | yes | - | matching-results-service, to list the applicant's matches |
| `JOB_SERVICE_URL` | yes | - | job-service, `GET /internal/roles/:id` to name a conversation when the match has no title |
| `REDIS_URL` | no | `redis://localhost:6379` | Redis for the rate-limit counters |
| `INTERNAL_API_KEY` | no | unset | sent as `x-internal-key` on calls to `/internal/*` routes; unset = header not sent (local dev) |
| `CHAT_RATE_PER_MINUTE` | no | `10` | messages one user may send per minute |
| `CHAT_RATE_PER_DAY` | no | `200` | messages one user may send per day |
| `PORT` | no | `3008` | HTTP port |
| `ENABLE_DOCS` | no | `false` | `true` serves Swagger at `/docs` |
| `LOG_LEVEL` | no | `info` | `error`, `warn`, `info` or `debug` |
| `ALLOW_DB_RESET` | no | unset | only for `db:reset` in production |

## HTTP

JWT roles: `APPLICANT | COMPANY | ADMIN`. Errors use Nest's default JSON (`{ statusCode, message, error }`).

| Route | Who | What |
|---|---|---|
| `GET /health` | anyone | `200 {status:"ok"}`, or `503 {status:"degraded"}` when the database or Redis is down |
| `GET /chat/conversations` | applicant | own conversations, newest activity first; creates one for every match that has none yet |
| `PATCH /chat/conversations/:id` | applicant | `{ name }` renames an own conversation |
| `GET /chat/conversations/:id/messages` | applicant | the messages of an own conversation |
| `POST /chat/conversations/:id/messages` | applicant | `{ message }` -> `{ reply, messageId }`. Rate limited |
| `POST /chat/quick` | company | `{ message }` -> `{ reply }`. Rate limited, nothing is stored |

`503` with a friendly message when chatbot-agent cannot answer; the question is then not saved, so the user can simply try again.

## Rate limit

Per user, on the two routes that call the model: **10 messages a minute and 200 a day** (`CHAT_RATE_PER_MINUTE` / `CHAT_RATE_PER_DAY`).
Over the limit the answer is `429` with a `Retry-After` header and a message that says how long to wait.

- The counters are Redis keys `chat:rate:minute:<userId>` and `chat:rate:day:<userId>` (one atomic `INCR` each), so any number of
  chat-service instances share **one** limit.
- A window starts with the user's first message and ends when its key expires (60 s / 24 h later). A message refused by the minute limit
  does not use up the daily allowance.
- If Redis cannot be reached the message is let through and a warning is logged: a Redis outage should not take the chat down.

## Calls to other services

| To | Why | Headers |
|---|---|---|
| chatbot-agent `POST /chat` | the answer | `x-request-id` |
| matching-results-service `GET /matches/mine` | the applicant's matches | the applicant's `Authorization`, `x-request-id` |
| job-service `GET /internal/roles/:id` | role title for a conversation name | `x-internal-key`, `x-request-id` |

This service has no `/internal/*` routes of its own. Every call has a timeout and a failure never becomes a raw 500.

## Logs

One JSON line per message: `ts`, `level`, `service`, `requestId`, `msg`. The `requestId` is taken from the `x-request-id` header (or created),
returned in the response header and forwarded to the services called. `/health` is not logged. Message texts are never logged.
