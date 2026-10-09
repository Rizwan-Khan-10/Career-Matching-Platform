# Match → applicant approval → company (resume as PDF, in the dashboard)

```
matching-agent ──match.computed──▶ results-service      Match(applicantStatus = pending)
               ──match.scanned───▶ results-service      RoleScan row for EVERY evaluated pair (dashboard numbers)
                                        │  e-mail to applicant: "you're eligible, review & approve"
applicant opens Matches, sees WHICH COMPANY, clicks "Approve"      (blocked if the company stopped the job)
                                        │  PATCH /matches/:id/approval {approved:true}
                                        ▼
                         match.approved ──▶ resume-parser-agent (pdf_consumer)
                                              already PDF → reuse | DOCX/DOC/RTF/ODT → LibreOffice | image/TXT → A4 PDF
                                              stored in Cloudinary (private) + Resume.pdfPublicId
                         resume.pdf.ready ──▶ results-service
                                              Match.resumeStatus = ready
                                              e-mail to the COMPANY: "candidate X approved, log in to view"  (NO attachment)
                                              candidate.ready ─▶ websocket-gateway ─▶ company dashboard updates live
company dashboard: only APPROVED candidates; "Download resume (PDF)" = GET /resumes/:id/pdf (signed 15 min link)
```

## Stopping a job
Company → Jobs → **Stop job** (any time) → `POST /jobs/:id/stop` sets `JobPosting.stoppedAt`:
* jd-extractor: a stopped posting is not downloaded/scanned; if it is stopped while the LLM is reading it, the result is
  discarded under a row lock (nothing written, nothing announced).
* matching-agent: stopped roles are never returned by retrieval, never scored, and results of a run that was in flight
  when the job was stopped are dropped.
* results-service: applicants can no longer approve; the Matches page shows "no longer accepting applications".
  Already approved candidates stay visible to the company.
* **Reopen job** → `POST /jobs/:id/reopen`: a never-scanned document is scanned now, an extracted one is re-matched against
  all resumes (including those uploaded while it was stopped).

## Dashboard numbers
* **Scanned** = distinct applicants the matching-agent evaluated against the job(s) (eligible or not)
* **Matched** = of those, eligible
* **Applied** = of those, the applicant approved sharing their resume (approved AND eligible)
* **Shortlisted** = recruiter pressed Shortlist

Company: `GET /stats/company` (own jobs only). Admin: `GET /stats/admin` (platform totals, by company, by job role).
Company/admin totals count a person once even if scanned for several roles; per-company rows in the admin table are sums over roles.
Numbers appear after the matching-agent has (re)scanned: for data that existed before this update run
`python -m scripts.backfill_embeddings --rematch`.

## Rules enforced on the server (not just in the UI)
* Company sees a match / applicant name / resume **only after** `applicantStatus = approved` (`/matches/role/:id`,
  `/applicants/summaries`, `/resumes/:id/pdf` all check it, and that the role belongs to that company).
* Only an **eligible** match can be approved. Approving twice is a no-op (no second e-mail). Approval can't be undone
  (the company already has access); "declined" can be changed to "approved" later.
* A resume that cannot be converted → `resumeStatus = failed`; applicant sees a "Try again" button.
* The company gets exactly the resume the match was computed on (`Match.resumeId`), not a newer upload.