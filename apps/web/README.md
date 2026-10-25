# web (Next.js, port 3000)

Frontend for applicants, companies and admins. Talks to the backend only through nginx (`NEXT_PUBLIC_API_URL`) and
receives live events from the websocket-gateway (`NEXT_PUBLIC_WS_URL`).

## Environment

Copy `.env.example` to `.env.local`.

| Name | Required | Example | Meaning |
|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | yes | `http://localhost` | nginx base URL for all REST calls |
| `NEXT_PUBLIC_WS_URL` | yes | `http://localhost:3007` | socket.io server (gateway directly, or the nginx URL) |

## Run

```bash
pnpm --filter web dev      # http://localhost:3000
pnpm --filter web build
pnpm --filter web start
pnpm --filter web lint
```

## Routes

| Group | Pages |
|---|---|
| `(auth)` | `/login`, `/signup` (shows the registration mode), `/forgot-password`, `/reset-password` |
| `(applicant)/applicant` | `dashboard`, `resume` (cards, target role, review and confirm), `matches` (approve/decline, shortlist details, AI prep tips, rejection feedback), `feedback`, `notifications`, `chat`, `chat/[conversationId]` |
| `(company)/company` | `dashboard`, `jobs` (upload, stop/reopen, role forms), `roles/[roleId]/applicants` (approved candidates, resume PDF, shortlist/reject), `ask`, `notifications` |
| `(admin)/admin` | `dashboard`, `applicants`, `companies`, `jobs` (posting approval), `import` (CSV), `settings`, `health`, `audit`, `notifications` |

`RequireRole` guards every group by the role in the JWT (`APPLICANT`, `COMPANY`, `ADMIN`).

## Structure

| Folder | Content |
|---|---|
| `app/` | App Router pages and layouts |
| `components/` | UI pieces by area (`ui`, `resume`, `matches`, `jobs`, `profile`, `layout`, ...) |
| `lib/` | `apiClient.ts` (axios, bearer token, single refresh on 401), `socket.ts`, `queryClient.ts`, `uploadTypes.ts` (allowed upload files, must match the backend `ALLOWED_EXTENSIONS`), `matchReason.ts` (verdict helpers: *Possible match*), `schemas/` (zod), `hooks/`, helpers |
| `store/` | `authStore.ts` (Zustand). `logout()` / signing in as another user / another tab changing the session also clears the React Query cache (`staleTime` is `Infinity`, query keys are not per user) |
| `types/` | shared TypeScript types (match the contracts in `00_TEAM_PLAN_AND_CONTRACTS.md`) |

Errors from the API are Nest JSON (`{ statusCode, message, error }`); the web shows `message` (`lib/errors.ts`).