from app.core.db import get_connection


def find_matching_roles_for_resume(resume_id: str, top_k: int = 10):
    """Given a resume, find the most similar open job roles."""
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT jr.id, jr.title, jr.requirements, jre.embedding <=> re.embedding AS distance
        FROM resume_embeddings re
        CROSS JOIN job_role_embeddings jre
        JOIN "jobs"."JobRole" jr ON jr.id = jre.job_role_id
        WHERE re.resume_id = %s
        ORDER BY distance ASC
        LIMIT %s
    """, (resume_id, top_k))
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return [{"jobRoleId": r[0], "title": r[1], "requirements": r[2], "distance": float(r[3])} for r in rows]


def find_matching_resumes_for_role(job_role_id: str, top_k: int = 50):
    """Given a role, find the most similar candidate resumes."""
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT r.id, r."applicantId", r."parsedData", re.embedding <=> jre.embedding AS distance
        FROM job_role_embeddings jre
        CROSS JOIN resume_embeddings re
        JOIN "resumes"."Resume" r ON r.id = re.resume_id
        WHERE jre.job_role_id = %s AND r.status = 'parsed'
        ORDER BY distance ASC
        LIMIT %s
    """, (job_role_id, top_k))
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return [{"resumeId": r[0], "applicantId": r[1], "parsedData": r[2], "distance": float(r[3])} for r in rows]