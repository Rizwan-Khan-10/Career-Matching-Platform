# Resume → confirm → match → applicant approval → company (resume as PDF, in the dashboard)

## Before a match exists: confirm gate and target roles
```
applicant uploads a resume and picks a TARGET ROLE (track + stack, e.g. Backend · Java)       POST /resumes
resume-parser-agent reads it ──resume.parsed──▶ in-app "Review and confirm your resume"      (matching does NOT start yet)
applicant checks the extracted data (and academic fields) and presses Confirm                  POST /resumes/:id/confirm
                    resume.confirmed ──▶ matching-agent starts matching this resume
edits after confirming publish resume.updated; edits before confirming publish nothing
```
* **Multiple resumes:** up to 5 (non-superseded) resumes per applicant, one **active** resume per target role
  (`applicantId` + `targetKey`). Confirming a new resume for the same target replaces the old one.
* **Active resume** = parsed + confirmed + not superseded. Only active resumes are matched.
* The matching-agent only pairs a resume with a role whose track / stacks are compatible (a Python resume is not
  scored against a Java role), so each role is compared with fewer resumes.
* **One match per (applicant, role):** if several of the applicant's resumes fit a role, the best one wins.

## Match → approval → company

Verdicts: `eligible` (e-mail "you're eligible" is sent), `review` (possible match: no e-mail, visible on the applicant's Matches page and approvable) and `not_eligible`. `Match.eligible` is true only for `eligible`; `Match.verdict` carries the three-way result.

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

## Which resume a match uses (replacement rule, contract 5.6)
When `match.computed` arrives for an (applicant, role) that already has a match:
1. **Already approved** → the shared resume is **frozen**. The row is refreshed only when the event is for the *same* resume;
   a result computed on any other resume is ignored.
2. Otherwise the new result replaces the old one when it is for the same resume, **or** has a strictly higher score,
   **or** the old resume is no longer active (superseded or deleted).
3. Otherwise the existing row is kept.

`resume.superseded` / `resume.deleted` → results-service deletes the **non-approved** matches and **all** scan rows of that resume.
An approved match is kept: the company may already hold that resume, which is why a resume used by an approved match is only
marked superseded (and kept) instead of being deleted. An applicant's re-score never undoes their consent (`applicantStatus` is not touched).

## Company decisions: shortlist and reject
Only the company that owns the role, only for **approved** candidates: `PATCH /matches/:id/decision`.
```
Shortlist form  roundName + mode (online|offline|phone) required; scheduledAt, bring, link, address, note optional
   ──candidate.shortlisted──▶ notification-service: e-mail + in-app to the applicant (company details verbatim, sent at once)
                           ──▶ feedback-agent writes an AI prep guide ──prep.ready──▶ results-service: Match.prepGuide (shown as "AI prep tips")
Reject form     reasonCategory (skills_gap | experience | resume_quality | position_filled | other) required; message optional
   ──candidate.rejected───▶ notification-service: in-app only (no e-mail)
                           ──▶ skills_gap / experience / resume_quality: feedback-agent writes improvement feedback
                               ──rejection-feedback.ready──▶ results-service: Match.rejectionFeedback (AI generated)
                               position_filled / other: feedback is null, only the polite message is shown
{ "decision": null }  clears the decision, the forms and the AI texts; no event
```
* Sending the same decision again is a no-op (no second event). Changing the decision removes the AI text of the old one.
  A late `prep.ready` / `rejection-feedback.ready` for a decision that no longer exists is dropped.
* If the event cannot be published, the change is rolled back and the company can try again, so the applicant is never left without the news.
* **Privacy:** the applicant sees `outcome`, the shortlist details, the AI texts and the company's optional message
  (`rejectionMessage`). The company's internal `reasonCategory` (stored as `rejectReason`), `decidedBy` and the scoring
  `breakdown` are never sent to the applicant.
* Decisions are also the real labels for retraining the scorer.

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
* **Applied** = of those, the applicant approved sharing their resume (approved AND eligible, or approved AND a *possible match*)
* Possible matches (`verdict = review`) are NOT counted in **Matched**; they only appear in the company's candidate list after the applicant approved them
* **Shortlisted** = recruiter pressed Shortlist
* **Rejected** = recruiter pressed Reject

Company: `GET /stats/company` (own jobs only). Admin: `GET /stats/admin` (platform totals, by company, by job role, **by branch**).
Company/admin totals count a person once even if scanned for several roles (and, because the scan rows are per resume, a person
with two resumes is still one person); per-company rows in the admin table are sums over roles.
`byBranch` (`branch, scanned, matched, applied, shortlisted`, distinct applicants) groups by the applicant's effective branch:
admin-verified value, else the branch on their active resume, else what they entered themselves; nobody told us = `Unknown`.
Numbers appear after the matching-agent has (re)scanned: for data that existed before this update run
`python -m scripts.backfill_embeddings --rematch`.

## Rules enforced on the server (not just in the UI)
* Company sees a match / applicant name / resume **only after** `applicantStatus = approved` (`/matches/role/:id`,
  `/applicants/summaries`, `/resumes/:id/pdf` all check it, and that the role belongs to that company).
* Only an **eligible** match or a **possible match** (`verdict = review`) can be approved. A possible match is shown to the applicant as "possible, not confirmed" and to the company with a *Possible match* badge, because nobody (not even the engine) confirmed it. The company list shows eligible first, then possible matches, each best score first. Approving twice is a no-op (no second e-mail). Approval can't be undone
  (the company already has access); "declined" can be changed to "approved" later.
* A resume that cannot be converted → `resumeStatus = failed`; applicant sees a "Try again" button.
* The company gets exactly the resume the match was computed on (`Match.resumeId`), not a newer upload (frozen after approval, see above).
* Only the owning company can decide, only on approved candidates; anything else is a 403 / 404 so a company cannot probe matches it must not see.