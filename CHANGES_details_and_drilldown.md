# Details + drill-down: what changed

No new npm packages, pnpm-lock.yaml untouched. Nothing to install.

New endpoints (matching-results-service, behind the existing nginx `/stats/` route):
- GET  /stats/admin/people?stage=&jobRoleId=&companyId=&branch=&q=&page=&limit=&sort=
- GET  /stats/admin/applicant-stages
- POST /stats/admin/people/export-log      (writes `export.people` to the audit log)
- GET  /stats/company/people?stage=applied|shortlisted|rejected&jobRoleId=...
- GET  /stats/company/roles/:jobRoleId/insights   (aggregate only, no names)
- GET  /admin/audit now returns actorName + targetLabel and accepts ?personId=
- admin opening a resume PDF writes `resume.viewed` to the audit log

New env (already added to docker-compose.yml and .env.example):
- resume-service and matching-results-service need USER_SERVICE_URL (+ INTERNAL_API_KEY, already there).
  For local dev add `USER_SERVICE_URL=http://localhost:3002` to their .env.

Run the tests: `pnpm --filter matching-results-service test`, `... resume-service test`, `... user-service test`.
