"""One-off migration: rebuild every stored vector with the NEW structured profile text, optionally re-run matching.

Old vectors were built from raw resume text / a JSON dump of the role, so they are not comparable.

    python -m scripts.backfill_embeddings            # re-embed resumes + roles
    python -m scripts.backfill_embeddings --rematch  # ...then re-score every applicant's latest resume
"""
import argparse
import json

from app.core.db import get_conn
from app.core.embeddings import embed_many
from app.core.redis_stream import publish
from app.services.profile_text import resume_profile_text, role_profile_text
from app.services.vector_search import ensure_tables, upsert_resume_embedding, upsert_role_embedding


def _j(v):
    return json.loads(v) if isinstance(v, str) else (v or {})


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--rematch", action="store_true")
    a = ap.parse_args()
    ensure_tables()

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute('SELECT id, title, requirements FROM "jobs_service"."JobRole"')
        roles = cur.fetchall()
        cur.execute("""SELECT DISTINCT ON ("applicantId") id, "applicantId", "parsedData"
                       FROM "resumes_service"."Resume" WHERE status = 'parsed'
                       ORDER BY "applicantId", "createdAt" DESC""")
        resumes = cur.fetchall()

    texts = [role_profile_text(t, _j(req)) for _, t, req in roles]
    for (rid, _, _), vec in zip(roles, embed_many(texts) if texts else []):
        upsert_role_embedding(rid, vec)
    texts = [resume_profile_text(_j(pd)) for _, _, pd in resumes]
    for (rid, _, _), vec in zip(resumes, embed_many(texts) if texts else []):
        upsert_resume_embedding(rid, vec)
    print(f"re-embedded {len(roles)} roles and {len(resumes)} resumes")

    if a.rematch:
        for rid, applicant, pd in resumes:
            publish("resume.updated", {"resumeId": rid, "applicantId": applicant, **_j(pd)})
        print(f"queued re-matching for {len(resumes)} resumes")


if __name__ == "__main__":
    main()