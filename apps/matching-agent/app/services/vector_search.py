"""Retrieval (pgvector) + the tiny bits of SQL the matching agent needs.

Retrieval only SHORTLISTS candidates. The real decision is made by features.py + scorer.py.
All id comparisons are cast to text: Prisma ids are TEXT while the *_embeddings tables use UUID,
and Postgres has no `text = uuid` operator (the old query would raise an error at runtime).
"""
import json
import logging
from app.core.db import get_conn
from app.core.embeddings import to_pgvector
from app.services.compatibility import (
    ACADEMIC_RULE_SQL, ACTIVE_RESUME_SQL, RESUME_GATE_SQL, ROLE_GATE_SQL, role_gate_values,
)

log = logging.getLogger("matching.vector_search")


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
    # HNSW (cosine) indexes, each in its own transaction: an old pgvector without HNSW must not stop the agent starting.
    for table in ("resume_embeddings", "job_role_embeddings"):
        try:
            with get_conn() as conn, conn.cursor() as cur:
                cur.execute(f"CREATE INDEX IF NOT EXISTS {table}_embedding_hnsw ON {table} USING hnsw (embedding vector_cosine_ops)")
        except Exception as exc:
            log.warning("could not create HNSW index on %s (%s) - retrieval still works, just slower", table, str(exc)[:200])


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


def find_compatible_roles_for_resume(resume: dict, vec, limit: int, offset: int = 0,
                                     role_ids: list | None = None, academic_only: bool = False):
    """One PAGE (best similarity first) of compatible roles for an ACTIVE resume whose embedding is `vec`.
    The compatibility gate (track/stack) is part of the WHERE, i.e. applied before the similarity ordering / LIMIT,
    so pages contain compatible roles only.
    role_ids: restrict to these roles (resume.deleted re-check). academic_only: only roles with academic rules (profile.updated)."""
    extra, params = "", {"vec": to_pgvector(vec), "r_track": resume.get("targetTrack") or "other",
                         "r_stack": resume.get("targetStack") or "other", "limit": limit, "offset": offset}
    if role_ids is not None:
        if not role_ids:
            return []
        extra += " AND jr.id::text = ANY(%(role_ids)s::text[])"
        params["role_ids"] = list(role_ids)
    if academic_only:
        extra += f" AND {ACADEMIC_RULE_SQL}"
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(f"""
            SELECT jr.id, jr.title, jr.requirements, (jre.embedding <=> %(vec)s::vector) AS distance
            FROM job_role_embeddings jre
            JOIN "jobs_service"."JobRole" jr ON jr.id::text = jre.job_role_id::text
            JOIN "jobs_service"."JobPosting" jp ON jp.id = jr."jobPostingId"
            WHERE jp.status = 'extracted' AND jp."stoppedAt" IS NULL
              AND {ROLE_GATE_SQL}{extra}
            ORDER BY distance ASC, jr.id
            LIMIT %(limit)s OFFSET %(offset)s
        """, params)
        rows = cur.fetchall()
    return [{"jobRoleId": r[0], "title": r[1], "requirements": _json(r[2]), "distance": float(r[3])} for r in rows]


def find_compatible_resumes_for_role(role: dict, vec, limit: int, offset: int = 0):
    """One PAGE (best similarity first) of compatible ACTIVE resumes for a role whose embedding is `vec`
    (several per applicant are possible: one per target role). The gate is part of the WHERE."""
    track, stacks = role_gate_values(role.get("requirements"))
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(f"""
            SELECT {_RESUME_COLUMNS}, (re.embedding <=> %(vec)s::vector) AS distance
            FROM "resumes_service"."Resume" r
            JOIN resume_embeddings re ON re.resume_id::text = r.id
            WHERE {ACTIVE_RESUME_SQL} AND {RESUME_GATE_SQL}
            ORDER BY distance ASC, r.id
            LIMIT %(limit)s OFFSET %(offset)s
        """, {"vec": to_pgvector(vec), "role_track": track, "role_stacks": stacks,
              "has_stacks": bool(stacks), "limit": limit, "offset": offset})
        rows = cur.fetchall()
    return [{**_resume_row(r), "distance": float(r[5])} for r in rows]


def count_roles_for_resume(resume: dict) -> tuple[int, int]:
    """(all matchable roles, roles that pass the gate) - the difference is what the gate saved (stats 'gatedOut')."""
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(f"""
            SELECT COUNT(*), COUNT(*) FILTER (WHERE {ROLE_GATE_SQL})
            FROM job_role_embeddings jre
            JOIN "jobs_service"."JobRole" jr ON jr.id::text = jre.job_role_id::text
            JOIN "jobs_service"."JobPosting" jp ON jp.id = jr."jobPostingId"
            WHERE jp.status = 'extracted' AND jp."stoppedAt" IS NULL
        """, {"r_track": resume.get("targetTrack") or "other", "r_stack": resume.get("targetStack") or "other"})
        total, ok = cur.fetchone()
    return int(total), int(ok)


def count_resumes_for_role(role: dict) -> tuple[int, int]:
    """(all active resumes with an embedding, those that pass the gate)."""
    track, stacks = role_gate_values(role.get("requirements"))
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(f"""
            SELECT COUNT(*), COUNT(*) FILTER (WHERE {RESUME_GATE_SQL})
            FROM "resumes_service"."Resume" r
            JOIN resume_embeddings re ON re.resume_id::text = r.id
            WHERE {ACTIVE_RESUME_SQL}
        """, {"role_track": track, "role_stacks": stacks, "has_stacks": bool(stacks)})
        total, ok = cur.fetchone()
    return int(total), int(ok)


def _scan_hashes(where: str, params: tuple, key_index: int) -> dict:
    """{key: (inputHash, eligible)} from RoleScan (owned by matching-results-service; read-only here).
    If the column does not exist yet (that service's schema not merged) or the read fails, return {}: nothing is skipped,
    everything is simply scored - slower but always correct."""
    try:
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute(f'''SELECT "jobRoleId", "resumeId", "inputHash", eligible FROM "matches_service"."RoleScan"
                            WHERE "inputHash" IS NOT NULL AND {where}''', params)
            return {r[key_index]: (r[2], bool(r[3])) for r in cur.fetchall()}
    except Exception as exc:
        log.warning("could not read RoleScan.inputHash (%s) - scoring every pair", str(exc)[:200])
        return {}


def load_scan_hashes_for_resume(resume_id: str) -> dict:
    """{jobRoleId: (inputHash, eligible)} of the pairs already scanned for this resume."""
    return _scan_hashes('"resumeId" = %s', (resume_id,), 0)


def load_scan_hashes_for_role(role_id: str) -> dict:
    """{resumeId: (inputHash, eligible)} of the pairs already scanned for this role."""
    return _scan_hashes('"jobRoleId" = %s', (role_id,), 1)