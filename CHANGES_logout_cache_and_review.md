# Logout cache fix + review notes

## The bug
Login as company A, logout, login as company B in the same browser: B first sees A's data, a reload fixes it.

**Cause:** React Query keeps everything in memory and never refetches by itself (`lib/queryClient.ts`: `staleTime: Infinity`, `refetchOnMount: false`). Query keys are global (`['companyProfile']`, `['matches']`, `['applicantProfile']`, ...), not per user, and `logout()` only cleared tokens. The next user hit the old cache. Reload = empty cache = fresh fetch.

## The fix (apps/web/store/authStore.ts)
1. `logout()` now calls `queryClient.clear()` (after tokens are cleared, so RequireRole has already unmounted the pages and nothing refetches without a token). The 401 "session expired" path uses the same `logout()`, so it is covered too.
2. `setAuth()` clears the cache when the signing-in user is different from the stored one (login without a proper logout, e.g. expired session, Google login).
3. `storage` event: when another tab logs out or logs in as someone else, this tab clears its cache and re-reads the auth storage.
Also: `next.config.ts` now sends basic security headers (nosniff, X-Frame-Options DENY, Referrer-Policy, Permissions-Policy).

Test by hand: login company A -> open dashboard + profile -> logout -> login company B -> B's own data must show without reload. Same with two applicants, and with two tabs (logout in tab 1, tab 2 must go to login).

## Improvements done (second round)
1. **CORS**: all 7 APIs use `webCorsOptions()` (`src/common/cors.ts`, with a small spec): only `WEB_URL` (comma separated allowed) may call them from a browser; if `WEB_URL` is unset any origin is allowed, so local dev keeps working. `WEB_URL=http://localhost:3000` added to each service `.env.example`; docker-compose already sets it from `PUBLIC_URL`.
2. **Nginx rate limit** (both `nginx.conf` and `nginx.docker.conf`): `/auth/` 20 req/s per IP (burst 40), `/chat/` 5 req/s (burst 10), 429 beyond. Generous on purpose. If the e2e suite ever gets 429, raise the `auth_zone` rate.
3. **Browser security headers** in `apps/web/next.config.ts` (nosniff, X-Frame-Options DENY, Referrer-Policy, Permissions-Policy).
4. **Docs updated**: README (features, upload formats, how matching works incl. verdicts and experience band, security notes, go-live checklist), `docs/consent-flow.md` (possible matches, applied counts), `docs/CONTRACTS.md` (role requirements keys), `docs/PROJECT_SPEC.md`, `apps/matching-agent/README.md` (experience band, verdicts, new env vars), `apps/jd-extractor-agent/README.md`, `apps/web/README.md`.

## Not done on purpose
- **CSP**: needs per-page tuning; wrongly set it breaks the app. Do it after the demo.
- **httpOnly-cookie tokens**: big change across auth + web; localStorage is acceptable here if no user text is rendered as HTML.
- **`reactStrictMode: true`**: would double-run effects in dev (sockets, polling); turn on only with time to test.
- Moving Docker tags to fixed digests: just rebuild with `--pull --no-cache` before release.

## Not tested here
Nginx config could not be syntax-checked in my sandbox (no nginx/docker daemon); the directives are standard (`limit_req_zone` in `http`, `limit_req` in `location`). Run `docker compose up --build` once and open the site. The CORS helper logic was checked with a small script; jest specs run in your CI. `tsc` and `eslint` pass for web.

## Review notes (first round)
Checked: auth/2FA/rate limits, role guards on web, nginx routes, internal-key guards, upload limits, the matching/verdict work from the last PR, dependency audit result.
1. **CORS is `enableCors()` (open) on 7 services.** Fine behind nginx (one origin), but the services are also reachable on their own ports locally. Better: `enableCors({ origin: process.env.WEB_URL })` like websocket-gateway already does.
2. **Tokens live in localStorage (zustand persist).** Any XSS steals them. Acceptable for this project; the real protection is no unsafe HTML rendering (keep not using `dangerouslySetInnerHTML` with user text). Moving to httpOnly cookies is a big change, not needed now.
3. **No CSP.** Only the simple headers above were added. A CSP needs per-page tuning, do it after the demo if at all.
4. **nginx has no rate limit.** Login/signup limits exist in auth-service (Redis), which is enough; `limit_req` on `/auth/` and `/chat/` would be a cheap extra layer.
5. **Docker images use moving tags** (`node:22-slim`, `nginx:stable-alpine`). Rebuild with `--pull --no-cache` before submitting/deploying so security patches come in.
6. `reactStrictMode: false`: turning it on in dev shows effect/cleanup bugs earlier. Optional.
7. Still open from the last PR: Node tests (job-service, results-service) were not run in my sandbox, and upload/login were not tested by hand. CI + one manual round on your friend's machine will cover that.
8. Remaining `pnpm audit` items are Prisma CLI tooling only (see the security PR).
