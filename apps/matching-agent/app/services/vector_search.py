"""Retrieval (pgvector) + the tiny bits of SQL the matching agent needs.

Retrieval only SHORTLISTS candidates. The real decision is made by features.py + scorer.py.
All id comparisons are cast to text: Prisma ids are TEXT while the *_embeddings tables use UUID,
and Postgres has no `text = uuid` operator (the old query would raise an error at runtime).
"""
import json
from app.core.db import get_conn
from app.core.embeddings import to_pgvector
from app.services.compatibility import (
    ACADEMIC_RULE_SQL, ACTIVE_RESUME_SQL, RESUME_GATE_SQL, ROLE_GATE_SQL, role_gate_values,
)


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


def delete_resume_embedding(resume_id: str):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("DELETE FROM resume_embeddings WHERE resume_id::text = %s", (resume_id,))


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


def _resume_row(r) -> dict:
    return {"resumeId": r[0], "applicantId": r[1], "parsedData": _json(r[2]), "targetTrack": r[3], "targetStack": r[4]}


_RESUME_COLUMNS = 'r.id, r."applicantId", r."parsedData", r."targetTrack", r."targetStack"'


def get_active_resume(resume_id: str):
    """The resume only if it is ACTIVE (parsed + confirmed + not superseded); None otherwise (deleted / unconfirmed / replaced)."""
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(f'''SELECT {_RESUME_COLUMNS} FROM "resumes_service"."Resume" r
                        WHERE r.id = %s AND {ACTIVE_RESUME_SQL}''', (resume_id,))
        row = cur.fetchone()
    return _resume_row(row) if row else None


def is_resume_active(resume_id: str) -> bool:
    """Re-checked right before publishing: the resume may have been replaced or deleted while we were scoring."""
    return get_active_resume(resume_id) is not None


def get_active_resumes_for_applicant(applicant_id: str) -> list:
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(f'''SELECT {_RESUME_COLUMNS} FROM "resumes_service"."Resume" r
                        WHERE r."applicantId" = %s AND {ACTIVE_RESUME_SQL}
                        ORDER BY r."createdAt", r.id''', (applicant_id,))
        rows = cur.fetchall()
    return [_resume_row(r) for r in rows]


def scanned_role_ids(resume_id: str) -> list:
    """Roles this resume was ever evaluated against (RoleScan is owned by matching-results-service; read-only here)."""
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute('SELECT DISTINCT "jobRoleId" FROM "matches_service"."RoleScan" WHERE "resumeId" = %s ORDER BY 1', (resume_id,))
        return [r[0] for r in cur.fetchall()]


def find_compatible_roles_for_resume(resume: dict, top_k: int = 50, role_ids: list | None = None, academic_only: bool = False):
    """Most similar roles for one ACTIVE resume. The compatibility gate (track/stack) runs in SQL, BEFORE the
    similarity ordering, so top-K is chosen among compatible roles only.
    role_ids: restrict to these roles (resume.deleted re-check). academic_only: only roles with academic rules (profile.updated)."""
    extra, params = "", {"resume_id": resume["resumeId"], "r_track": resume.get("targetTrack") or "other",
                         "r_stack": resume.get("targetStack") or "other", "top_k": top_k}
    if role_ids is not None:
        if not role_ids:
            return []
        extra += " AND jr.id::text = ANY(%(role_ids)s::text[])"
        params.update(role_ids=list(role_ids), top_k=max(top_k, len(role_ids)))
    if academic_only:
        extra += f" AND {ACADEMIC_RULE_SQL}"
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(f"""
            SELECT jr.id, jr.title, jr.requirements, (jre.embedding <=> re.embedding) AS distance
            FROM resume_embeddings re
            JOIN job_role_embeddings jre ON TRUE
            JOIN "jobs_service"."JobRole" jr ON jr.id::text = jre.job_role_id::text
            JOIN "jobs_service"."JobPosting" jp ON jp.id = jr."jobPostingId"
            WHERE re.resume_id::text = %(resume_id)s AND jp.status = 'extracted' AND jp."stoppedAt" IS NULL
              AND {ROLE_GATE_SQL}{extra}
            ORDER BY distance ASC, jr.id
            LIMIT %(top_k)s
        """, params)
        rows = cur.fetchall()
    return [{"jobRoleId": r[0], "title": r[1], "requirements": _json(r[2]), "distance": float(r[3])} for r in rows]


def find_compatible_resumes_for_role(role: dict, top_k: int = 100):
    """Most similar ACTIVE resumes for one role (several per applicant are possible: one per target role).
    The compatibility gate runs in SQL before the similarity ordering."""
    track, stacks = role_gate_values(role.get("requirements"))
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(f"""
            SELECT {_RESUME_COLUMNS}, (re.embedding <=> jre.embedding) AS distance
            FROM "resumes_service"."Resume" r
            JOIN resume_embeddings re ON re.resume_id::text = r.id
            JOIN job_role_embeddings jre ON jre.job_role_id::text = %(role_id)s
            WHERE {ACTIVE_RESUME_SQL} AND {RESUME_GATE_SQL}
            ORDER BY distance ASC, r.id
            LIMIT %(top_k)s
        """, {"role_id": role["jobRoleId"], "role_track": track, "role_stacks": stacks,
              "has_stacks": bool(stacks), "top_k": top_k})
        rows = cur.fetchall()
    return [{**_resume_row(r), "distance": float(r[5])} for r in rows]