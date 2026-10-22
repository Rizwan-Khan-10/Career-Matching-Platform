# Matching plan: remaining work (on top of OAuth / UI / drill-down zip)

## What was added
- **job-service (C1)**: `maxExperienceYears`, `strictMinExperience` in create/update DTOs; max < min is a 400; specs; `prisma/backfill_fresher_max_experience.sql` (one-time, fresher roles get max 1).
- **matching-results-service (C9)**: `verdict` column on `Match` and `RoleScan` (default `eligible`), saved from the event (`verdictOf`: eligible=true always wins; else `verdict`, else `breakdown.verdict`). Company list = eligible + review (eligible first, then review, best score first). Applicant can approve a `review` match. "Applied" counts (stats + drill-down) include approved review matches; "matched" stays eligible-only. Tests updated/added. `prisma/backfill_verdict.sql` run ONCE after `db push`.
- **web (C7/C10)**: role form has Max experience + "Reject below minimum" toggle, Fresher pre-fills max=1, min<=max check, warning when fresher max > 5; role card shows "2-4 yrs experience". "Possible match" badge/tab in company candidates (card + table) with a "look at it yourself" note; applicant sees "Possible match" group, a "possible, not confirmed" line before approving, and an "automated screening" line on the Matches page. Types: `Match.verdict`.
- **Upload formats**: `lib/uploadTypes.ts` (pdf, docx, txt, jpg, jpeg, png, bmp, tiff, webp; `.doc` gives a clear message), used by UploadDropzone and UploadJobDropzone; JobPostingCard text.
- **jd-extractor (C11)**: suggests `maxExperienceYears` only when the JD states a range ("2-4 years" -> 2 / 4); wrong band dropped; tests.
- **resume-parser internship fix**: internships / trainee entries no longer count in `experienceYears` (only-internship resume = 0.0). Old stored resumes keep the old number until re-parsed.
- docs/CONTRACTS.md: verdict lines.

## Mistakes found in the zip (fixed)
1. **docker-compose did not pass `ELIGIBILITY_THRESHOLD` to matching-agent** (only `.env.compose.example` had it) -> in Docker the bar would have been 0.5, not 0.40. Compose now passes it + REVIEW_BAND_WIDTH, MAX_REVIEW_*, OVERQUALIFIED_EXTRA_YEARS, FRESHER_ELIGIBILITY_THRESHOLD.
2. matching-agent `.env.example` had `ELIGIBILITY_THRESHOLD` twice (blank comment + 0.40): cleaned.
3. Upload dropzones in the zip were still PDF-only (the earlier upload change had not been merged).
4. Applicant UI already had an "Almost eligible" group guessed from the reason text; now uses the real `verdict` and is named "Possible match".
5. Nothing from auth/2FA/Google, UI plan or drill-down was removed: diff of old zip vs new zip shows only additions/changes by those plans; matching-agent, job-service, jd-extractor were untouched by them.

## Deploy order
1. `pnpm --filter matching-results-service db:push` then run `prisma/backfill_verdict.sql`.
2. (once) `apps/job-service/prisma/backfill_fresher_max_experience.sql`.
3. Restart matching-agent: policy change re-scores all pairs (expected).

## Not tested here
Node tests (job-service, results-service) and web build could not run in my sandbox (needs Node 24 + Prisma engines download). `tsc` on web is clean; Python tests pass (jd-extractor 50, resume-parser experience/parser tests). Please run `pnpm --filter job-service test`, `pnpm --filter matching-results-service test`, `pnpm --filter web build`.
Also known/left as is: feedback-agent still writes "how to improve" text for review pairs (harmless); no notification e-mail for review matches (by design).
