from contextlib import closing

from app.core.db import get_connection
from app.services.target_label import target_label


def get_context_for_applicant(applicant_id: str, job_role_id: str | None = None) -> dict:
    """Everything the bot may know: this applicant's latest PARSED resume + their match result(s) + the role. Always scoped by applicantId."""
    with closing(get_connection()) as conn, conn.cursor() as cur:
        cur.execute(
            'SELECT "parsedData" FROM "resumes_service"."Resume" '
            "WHERE \"applicantId\" = %s AND status = 'parsed' ORDER BY \"createdAt\" DESC LIMIT 1",
            (applicant_id,),
        )
        resume = cur.fetchone()

        cols = 'SELECT "jobRoleId", "roleTitle", score, eligible, reason, "matchedSkills", "partialSkills", "missingSkills", feedback FROM "matches_service"."Match" '
        if job_role_id:
            cur.execute(cols + 'WHERE "applicantId" = %s AND "jobRoleId" = %s', (applicant_id, job_role_id))
        else:
            cur.execute(cols + 'WHERE "applicantId" = %s ORDER BY score DESC LIMIT 20', (applicant_id,))
        matches = cur.fetchall()

        role_info = None
        if job_role_id:
            cur.execute('SELECT title, requirements FROM "jobs_service"."JobRole" WHERE id = %s', (job_role_id,))
            row = cur.fetchone()
            if row:
                role_info = {"title": row[0], "requirements": row[1]}

    return {
        "resume": resume[0] if resume else None,
        "matches": [
            {"jobRoleId": m[0], "roleTitle": m[1], "score": m[2], "eligible": m[3], "reason": m[4],
             "matchedSkills": m[5], "partialSkills": m[6], "missingSkills": m[7], "feedback": m[8]}
            for m in matches
        ],
        "role": role_info,
    }


MAX_ROLES = 20
MAX_CANDIDATES_PER_ROLE = 10

# What the dashboard words mean, so the assistant explains them the way the company sees them (contract 5.6, consent-flow.md).
GLOSSARY = {
    "scanned": "applicants the matching engine compared with this role (each person counted once)",
    "matched": "scanned applicants the engine judged eligible for the role",
    "applied": "matched applicants who also approved sharing their resume with this company. Only these people are listed as candidates",
    "shortlisted": "candidates this company shortlisted",
    "rejected": "candidates this company rejected",
    "undecided": "candidates who approved sharing and have not been shortlisted or rejected yet",
    "score": "fit between 0 and 1 (1 = best fit); a candidate list is sorted best first",
    "matchedSkills": "required skills the resume shows",
    "partialSkills": "required skills the resume only shows something related to",
    "missingSkills": "required skills the resume does not show",
    "unverifiedRules": "campus rules (cgpa, branch, passingYear, backlogs) the engine could not check because that value of the applicant is unknown; "
                       "they did not exclude the candidate, but they are not confirmed either",
    "resumeTarget": "the role type the applicant uploaded this resume for, e.g. Backend · Java",
    "level": "fresher (projects and skills count, not work years), experienced (years of experience count) or any",
    "stopped": "the job posting was stopped, so it gets no new matches",
}

# The only keys a candidate entry may ever have. Nothing else about a person (id, contact, resume text or file,
# the company's own reject reason or notes) goes into the context.
CANDIDATE_KEYS = ("name", "score", "matchedSkills", "partialSkills", "missingSkills", "decision", "unverifiedRules", "resumeTarget")


def _roles_sql() -> str:
    return '''SELECT jr.id, jr.title, jr.requirements, (jp."stoppedAt" IS NOT NULL),
                  COALESCE(s.scanned, 0), COALESCE(s.matched, 0),
                  COALESCE(m.applied, 0), COALESCE(m.shortlisted, 0), COALESCE(m.rejected, 0)
           FROM "jobs_service"."JobPosting" jp
           JOIN "jobs_service"."JobRole" jr ON jr."jobPostingId" = jp.id
           LEFT JOIN (
               SELECT "jobRoleId", COUNT(DISTINCT "applicantId") AS scanned,
                      COUNT(DISTINCT "applicantId") FILTER (WHERE eligible) AS matched
               FROM "matches_service"."RoleScan" GROUP BY "jobRoleId"
           ) s ON s."jobRoleId" = jr.id
           LEFT JOIN (
               SELECT "jobRoleId",
                      COUNT(*) FILTER (WHERE "applicantStatus" = 'approved' AND eligible) AS applied,
                      COUNT(*) FILTER (WHERE decision = 'shortlisted') AS shortlisted,
                      COUNT(*) FILTER (WHERE decision = 'rejected') AS rejected
               FROM "matches_service"."Match" GROUP BY "jobRoleId"
           ) m ON m."jobRoleId" = jr.id
           WHERE jp."companyId" = %s
           ORDER BY jr."createdAt" DESC LIMIT %s'''


def _candidates_sql() -> str:
    # ONLY eligible matches whose applicant approved sharing. No resume content, no resume file / PDF state, no reject reason or note.
    return '''SELECT role_id, name, score, "matchedSkills", "partialSkills", "missingSkills", decision, "unverifiedRules",
                  "targetTrack", "targetStack", "applicantStatus", eligible
           FROM (
               SELECT m."jobRoleId" AS role_id, ap.name AS name, m.score, m."matchedSkills", m."partialSkills", m."missingSkills",
                      m.decision, m."unverifiedRules", r."targetTrack", r."targetStack", m."applicantStatus", m.eligible,
                      ROW_NUMBER() OVER (PARTITION BY m."jobRoleId" ORDER BY m.score DESC) AS rn
               FROM "matches_service"."Match" m
               LEFT JOIN "users_service"."ApplicantProfile" ap ON ap."userId" = m."applicantId"
               LEFT JOIN "resumes_service"."Resume" r ON r.id = m."resumeId"
               WHERE m."jobRoleId" = ANY(%s) AND m.eligible = true AND m."applicantStatus" = 'approved'
           ) t
           WHERE rn <= %s
           ORDER BY role_id, rn'''


def _candidate(row) -> dict:
    (_role_id, name, score, matched, partial, missing, decision, unverified, track, stack, _status, _eligible) = row
    return {
        "name": name or "Candidate",
        "score": round(float(score), 2) if score is not None else None,
        "matchedSkills": matched or [],
        "partialSkills": partial or [],
        "missingSkills": missing or [],
        "decision": decision if decision in ("shortlisted", "rejected") else "undecided",
        "unverifiedRules": unverified or [],
        "resumeTarget": target_label(track, stack),
    }


def get_context_for_company(company_id: str) -> dict:
    """Everything the bot may know about ONE company: its roles with requirements, the same counts as its dashboard
    (scanned, matched, applied, shortlisted, rejected) and - per role - the best candidates who APPROVED sharing (name, score,
    matched / partial / missing skills, decision, unverifiedRules, resume target label), plus a glossary of the dashboard words.
    Never: applicants who did not approve, resume text or files, the company's own reject reason, other companies' data."""
    with closing(get_connection()) as conn, conn.cursor() as cur:
        cur.execute(_roles_sql(), (company_id, MAX_ROLES))   # scoped by the company that owns the posting
        roles = cur.fetchall()
        role_ids = [r[0] for r in roles]

        by_role: dict[str, list[dict]] = {rid: [] for rid in role_ids}
        if role_ids:
            cur.execute(_candidates_sql(), (role_ids, MAX_CANDIDATES_PER_ROLE))
            for row in cur.fetchall():
                role_id, status, eligible = row[0], row[10], row[11]
                # belt and braces on top of the SQL filter: only this company's roles, only approved and eligible
                if role_id in by_role and status == "approved" and eligible:
                    by_role[role_id].append(_candidate(row))

    return {
        "roles": [
            {
                "jobRoleId": r[0], "title": r[1], "requirements": r[2], "stopped": bool(r[3]),
                "counts": {"scanned": int(r[4]), "matched": int(r[5]), "applied": int(r[6]), "shortlisted": int(r[7]), "rejected": int(r[8])},
                "candidates": by_role[r[0]],
                "candidatesShown": len(by_role[r[0]]),
            }
            for r in roles
        ],
        "glossary": GLOSSARY,
    }
