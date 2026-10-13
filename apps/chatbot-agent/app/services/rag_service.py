from contextlib import closing

from app.core.db import get_connection


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


def get_context_for_company(company_id: str) -> dict:
    """The company's own roles + AGGREGATE counts only (same numbers as its dashboard). No candidate identities or resumes."""
    with closing(get_connection()) as conn, conn.cursor() as cur:
        cur.execute(
            '''SELECT jr.id, jr.title, jr.requirements,
                      (SELECT COUNT(*) FROM "matches_service"."RoleScan" rs WHERE rs."jobRoleId" = jr.id),
                      (SELECT COUNT(*) FROM "matches_service"."Match" m WHERE m."jobRoleId" = jr.id AND m.eligible),
                      (SELECT COUNT(*) FROM "matches_service"."Match" m
                        WHERE m."jobRoleId" = jr.id AND m.eligible AND m."applicantStatus" = 'approved')
               FROM "jobs_service"."JobPosting" jp
               JOIN "jobs_service"."JobRole" jr ON jr."jobPostingId" = jp.id
               WHERE jp."companyId" = %s
               ORDER BY jr."createdAt" DESC LIMIT 50''',
            (company_id,),
        )
        roles = cur.fetchall()
    return {"roles": [
        {"jobRoleId": r[0], "title": r[1], "requirements": r[2],
         "scanned": int(r[3]), "matched": int(r[4]), "shared": int(r[5])}
        for r in roles
    ]}