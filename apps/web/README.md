# web (Next.js, port 3000)

Frontend for applicants, companies and admins. Talks to the backend only through nginx (`NEXT_PUBLIC_API_URL`) and
receives live events from the websocket-gateway (`NEXT_PUBLIC_WS_URL`).

## Environment

Copy `.env.example` to `.env.local`.

| Name | Required | Example | Meaning |
|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | yes | `http://localhost` | nginx base URL for all REST calls |
| `NEXT_PUBLIC_WS_URL` | yes | `http://localhost:3007` | socket.io server (gateway directly, or the nginx URL) |
| `NEXT_PUBLIC_USE_MOCKS` | no | `false` | `true` = fake responses for endpoints whose backend is not merged yet |

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
| `lib/` | `apiClient.ts` (axios, bearer token, single refresh on 401), `socket.ts`, `queryClient.ts`, `schemas/` (zod), `hooks/`, helpers |
| `store/` | `authStore.ts` (Zustand) |
| `types/` | shared TypeScript types (match the contracts in `00_TEAM_PLAN_AND_CONTRACTS.md`) |

Errors from the API are Nest JSON (`{ statusCode, message, error }`); the web shows `message` (`lib/errors.ts`).

## Mocks (temporary)

With `NEXT_PUBLIC_USE_MOCKS=true`, `lib/mocks` answers the endpoints whose backend is not merged yet; every other call goes to the real backend.
The mocks are removed once all backends are merged (task 4.12).

Switch scenarios in the browser console, then refresh:

| Key (localStorage) | Values / use |
|---|---|
| `mock-reg-mode` | `open`, `invite_only`, `domain` |
| `mock-company-status` | `pending`, `approved`, `rejected` |
| `mock-job-approval` | `pending`, `approved`, `rejected` (newest job posting) |
| `mock-health` | `ok`, `dead` (admin health page) |
| `mock-admin-data` | `off` = admin pages use the real backend |
| `mock-resumes`, `mock-matches`, `mock-candidates`, `mock-admin-users`, `mock-admin-settings`, `mock-imported-emails`, `mock-academic` | `localStorage.removeItem(...)` resets that fake data |

`window.mockNotify('shortlisted')` fakes a live notification (also `prep_ready`, `rejected`, `match_eligible`, `candidate_ready`).