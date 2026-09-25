from app.core.db import get_connection

def get_context_for_applicant(applicant_id: str, job_role_id: str | None = None) -> dict:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        'SELECT "parsedData" FROM "resumes"."Resume" WHERE "applicantId" = %s ORDER BY "createdAt" DESC LIMIT 1',
        (applicant_id,),
    )
    resume = cur.fetchone()

    if job_role_id:
        cur.execute(
            'SELECT "jobRoleId", score, eligible, feedback FROM "matches"."Match" '
            'WHERE "applicantId" = %s AND "jobRoleId" = %s',
            (applicant_id, job_role_id),
        )
    else:
        cur.execute(
            'SELECT "jobRoleId", score, eligible, feedback FROM "matches"."Match" WHERE "applicantId" = %s',
            (applicant_id,),
        )
    matches = cur.fetchall()

    role_info = None
    if job_role_id:
        cur.execute('SELECT title, requirements FROM "jobs"."JobRole" WHERE id = %s', (job_role_id,))
        row = cur.fetchone()
        if row:
            role_info = {"title": row[0], "requirements": row[1]}

    cur.close()
    conn.close()

    return {
        "resume": resume[0] if resume else None,
        "matches": [{"jobRoleId": m[0], "score": m[1], "eligible": m[2], "feedback": m[3]} for m in matches],
        "role": role_info,
    }

def get_context_for_company(company_id: str) -> dict:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        '''SELECT jp.id, jr.title, jr.requirements FROM "jobs"."JobPosting" jp
           JOIN "jobs"."JobRole" jr ON jr."jobPostingId" = jp.id
           WHERE jp."companyId" = %s''',
        (company_id,),
    )
    roles = cur.fetchall()
    cur.close()
    conn.close()
    return {"roles": [{"jobPostingId": r[0], "title": r[1], "requirements": r[2]} for r in roles]}
