"""Retrieval (pgvector) + the tiny bits of SQL the matching agent needs.

Retrieval only SHORTLISTS candidates. The real decision is made by features.py + scorer.py.
All id comparisons are cast to text: Prisma ids are TEXT while the *_embeddings tables use UUID,
and Postgres has no `text = uuid` operator (the old query would raise an error at runtime).
"""
import json
from app.core.db import get_conn
from app.core.embeddings import to_pgvector


def _json(v):
    if isinstance(v, str):
        try:
            return json.loads(v)
        except ValueError:
            return {}
    return v or {}


def ensure_tables():
    with get_conn() as conn, conn.cursor() as cur:
        # the pgvector extension is created by the parser agents / DB setup; not our job here
        cur.execute("CREATE TABLE IF NOT EXISTS resume_embeddings (resume_id UUID PRIMARY KEY, embedding VECTOR(384))")
        cur.execute("CREATE TABLE IF NOT EXISTS job_role_embeddings (job_role_id UUID PRIMARY KEY, embedding VECTOR(384))")


def upsert_resume_embedding(resume_id: str, vec):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            "INSERT INTO resume_embeddings (resume_id, embedding) VALUES (%s, %s::vector) "
            "ON CONFLICT (resume_id) DO UPDATE SET embedding = EXCLUDED.embedding",
            (resume_id, to_pgvector(vec)),
        )


def upsert_role_embedding(role_id: str, vec):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            "INSERT INTO job_role_embeddings (job_role_id, embedding) VALUES (%s, %s::vector) "
            "ON CONFLICT (job_role_id) DO UPDATE SET embedding = EXCLUDED.embedding",
            (role_id, to_pgvector(vec)),
        )


def delete_role_embedding(role_id: str):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("DELETE FROM job_role_embeddings WHERE job_role_id::text = %s", (role_id,))


def get_role(role_id: str):
    """Role + whether its posting was stopped by the company (stopped roles must not be matched)."""
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("""
            SELECT jr.id, jr.title, jr.requirements, jp."stoppedAt" IS NOT NULL
            FROM "jobs_service"."JobRole" jr
            JOIN "jobs_service"."JobPosting" jp ON jp.id = jr."jobPostingId"
            WHERE jr.id = %s
        """, (role_id,))
        row = cur.fetchone()
    return {"jobRoleId": row[0], "title": row[1], "requirements": _json(row[2]), "stopped": bool(row[3])} if row else None


def is_role_active(role_id: str) -> bool:
    """True while the role exists and its posting is not stopped (re-checked right before publishing)."""
    role = get_role(role_id)
    return bool(role) and not role["stopped"]


def find_matching_roles_for_resume(resume_id: str, top_k: int = 50):
    """Most similar roles (of postings that finished extraction) for one resume."""
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("""
            SELECT jr.id, jr.title, jr.requirements, (jre.embedding <=> re.embedding) AS distance
            FROM resume_embeddings re
            JOIN job_role_embeddings jre ON TRUE
            JOIN "jobs_service"."JobRole" jr ON jr.id::text = jre.job_role_id::text
            JOIN "jobs_service"."JobPosting" jp ON jp.id = jr."jobPostingId"
            WHERE re.resume_id::text = %s AND jp.status = 'extracted' AND jp."stoppedAt" IS NULL
            ORDER BY distance ASC
            LIMIT %s
        """, (resume_id, top_k))
        rows = cur.fetchall()
    return [{"jobRoleId": r[0], "title": r[1], "requirements": _json(r[2]), "distance": float(r[3])} for r in rows]


def find_matching_resumes_for_role(job_role_id: str, top_k: int = 100):
    """Most similar candidates for one role. Only each applicant's LATEST parsed resume is considered."""
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("""
            WITH latest AS (
                SELECT DISTINCT ON ("applicantId") id, "applicantId", "parsedData"
                FROM "resumes_service"."Resume"
                WHERE status = 'parsed'
                ORDER BY "applicantId", "createdAt" DESC
            )
            SELECT l.id, l."applicantId", l."parsedData", (re.embedding <=> jre.embedding) AS distance
            FROM job_role_embeddings jre
            JOIN latest l ON TRUE
            JOIN resume_embeddings re ON re.resume_id::text = l.id
            WHERE jre.job_role_id::text = %s
            ORDER BY distance ASC
            LIMIT %s
        """, (job_role_id, top_k))
        rows = cur.fetchall()
    return [{"resumeId": r[0], "applicantId": r[1], "parsedData": _json(r[2]), "distance": float(r[3])} for r in rows]