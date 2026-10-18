# websocket-gateway  (port 3007)

**Purpose:** socket.io server that pushes live events to the browser. A client connects with its JWT, the gateway verifies it and puts the socket into the room `user:<id>` (several tabs of one user all join the same room). Redis Streams events are delivered to the room of their recipient; pages react by refetching their data, and the notification bell shows `notification.created` live.

## Port
`3007` (`PORT`). nginx forwards `/socket.io/` here (with the WebSocket upgrade).

## Routes
| Method | Path | Role | Notes |
|---|---|---|---|
| WS | `/socket.io/` | any (JWT) | `io(URL, { path: '/socket.io', auth: { token } })`; `?token=` in the query string is accepted too. An invalid or missing token is disconnected at once |
| GET | `/health` | none | `200 {status:"ok"}`, or `503 {status:"degraded"}` when Redis does not answer |

## Events consumed
Consumer group `ws-gateway-group` on every stream below. Each event is emitted to the browser under **the stream name**, with the payload as published, to the room of its recipient: `data.applicantId || data.companyId || data.userId` (contract section 6).

| Stream | Recipient | Payload the browser gets |
|---|---|---|
| `resume.parsed`, `match.computed`, `feedback.ready` | applicant (`applicantId`) | as published |
| `jd.extracted`, `candidate.ready` | company (`companyId`) | as published |
| `candidate.shortlisted`, `prep.ready`, `rejection-feedback.ready` | applicant (`applicantId`) | as published |
| `candidate.rejected` | applicant (`applicantId`) | as published **without `reasonCategory`**: the applicant must never see the internal reason (contract 5.6) |
| `company.status.changed`, `job.approval.changed` | company (`companyId`) | as published |
| `notification.created` | `data.userId` | `{ userId, notification }`; the notification is `{ id, type, title, body, data, readAt, createdAt }` |

The gateway produces no events.

### Reliability
- Streams are read with **one** blocking `XREADGROUP` over all streams on its own Redis connection.
- A failed push is retried 3 times, then written to `<stream>.dead` (`MAXLEN ~ 10000`) and acknowledged. A payload that is not a JSON object, or has no `applicantId`/`companyId`/`userId`, goes to `<stream>.dead` at once.
- Messages delivered but never acknowledged (crash, restart) are reclaimed with `XAUTOCLAIM` (idle > 60 s, checked every 30 s); one delivered more than 5 times is dead-lettered.
- A new group starts at `$`: only events from now on (a live push of old history is useless). The Redis connection reconnects by itself after a Redis restart.
- Events for a user who is not connected are simply dropped: the web refetches on every (re)connect.
- **One gateway instance only.** All instances would share one consumer group, so each event would reach just one of them.

### CORS
Only `WEB_URL` may open a socket from a browser (several origins: separate with commas). Requests without an `Origin` header (servers, scripts) are not affected. The HTTP side (`/health`) uses the same rule.

## Database
None.

## Environment variables
| Name | Required | Example | Meaning |
|---|---|---|---|
| `PORT` | no | `3007` | HTTP / socket port |
| `REDIS_URL` | yes | `redis://localhost:6379` | Redis Streams |
| `JWT_SECRET` | yes | `change-me` | same value in every service; sockets are verified with it |
| `WEB_URL` | yes | `http://localhost:3000` | browser origin(s) allowed to connect (default `http://localhost:3000`) |

## Run locally
```bash
cp .env.example .env
pnpm --filter websocket-gateway start:dev
```
Client: `io(process.env.NEXT_PUBLIC_WS_URL, { auth: { token } })`, path `/socket.io/`.

## Test
```bash
pnpm --filter websocket-gateway test      # unit tests (no Redis needed), incl. "notification.created reaches the right user"
```
Real-socket check against a running gateway and Redis (two users, real `socket.io-client`, events published with `XADD`):
```bash
JWT_SECRET=<same value as the gateway> pnpm --filter websocket-gateway smoke
```
It checks that `notification.created` reaches every tab of the owner and nobody else, that shortlist / approval events go to the right role, that `reasonCategory` is removed, and that a token signed with another secret is disconnected.

## Depends on
Redis, and the producers of the events above (notification-service for `notification.created`). Every token is issued by auth-service.