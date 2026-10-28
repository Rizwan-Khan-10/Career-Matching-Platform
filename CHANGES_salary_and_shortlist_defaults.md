# Salary on roles + saved shortlist details

## 1. Salary (optional, per role)
- **Data**: in `JobRole.requirements` (JSON, no migration): `salaryMin`, `salaryMax`, `salaryCurrency` (INR/USD/EUR/GBP), `salaryPeriod` (year/month). Either bound alone is fine. Max below min = 400. Currency/period default to INR / year when an amount is set and are cleared when both amounts are cleared (`job-service`).
- **Never used for matching**: `matching-agent/app/services/input_hash.py` leaves the salary keys out of `inputHash`, so editing a salary does not re-score any pair (test added).
- **Company UI**: role form has a salary row (min, max, currency, per year/month); role card shows e.g. `₹4-6 LPA` (INR per year from one lakh is shown as LPA, everything else as full numbers).
- **Applicant UI**: `GET /matches/mine` now carries `salary` (read from the role in `roleInfo`); the match card shows `Salary: ...`. Nothing shown when the company set none.
- **JD extractor**: asks the LLM for the salary only when the document states one ("4-6 LPA" -> 400000/600000 per year). Coercion drops anything unclear; a max below the min is dropped; no amount = no currency/period. Company can edit afterwards like every other field.

## 2. Saved shortlist details (write once, edit before sending)
- **Storage**: `CompanyProfile.shortlistDefaults` (Json, nullable; `prisma db push` adds the column, nothing to backfill). Private to the company (removed from the admin company list).
- **API** (user-service): `GET /companies/me/shortlist-defaults`, `PUT /companies/me/shortlist-defaults` (replaces; saving only empty fields clears). Fields: roundName, mode, link, address, bring, note. The date/time is never saved. DTO limits = same as the form.
- **UI**: the shortlist form opens pre-filled from the saved details (a new shortlist only; editing an existing shortlist shows what was sent). Everything stays editable. A checkbox "Save these details for my next shortlists" (on for new shortlists) stores the version you just sent, *after* the shortlist succeeded (a failed save only shows a toast). "Remove my saved details" clears them.
- The candidate still gets exactly what the company sent; nothing else changed in the shortlist flow.

## Deploy
1. `pnpm --filter user-service db:push` (adds `shortlistDefaults`), regenerate Prisma clients as usual.
2. Nothing for job-service (JSON) or results-service (reads JSON).
3. Restart matching-agent not needed for behaviour; only if you want the hash change loaded.

## Tests (run here with Node 24, Prisma client stubbed because engines cannot be downloaded in my sandbox)
job-service 125, matching-results-service 115, user-service 95 jest tests pass; matching-agent efficiency tests and jd-extractor (53) pass; web `tsc` and `eslint` clean. Still needs a manual click-through: add a salary to a role and see it on the applicant's match card; shortlist someone with "save" ticked, open the shortlist form for the next candidate and check it is pre-filled.
(This run also executed the earlier job-service / results-service tests that I could not run before: they pass.)
