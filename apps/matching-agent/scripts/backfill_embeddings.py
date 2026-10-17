"""Rebuild stored vectors (after a profile_text / alias / embedder change), optionally re-run matching.

Only ACTIVE resumes are touched (Contract 4.9: status = 'parsed' AND confirmedAt IS NOT NULL AND supersededAt IS NULL, every
active resume of every applicant). Unconfirmed, failed and superseded resumes are never matched, so they are neither re-embedded
nor re-scored.

    python -m scripts.backfill_embeddings            # re-embed active resumes + all roles
    python -m scripts.backfill_embeddings --rematch  # ...then queue `resume.updated` for every active resume

After an embedder switch retrain first (scorer.py ignores a scorer made with another embedder): a new scorer version changes the
inputHash, so the rematch re-scores every pair instead of skipping it.
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
        cur.execute("""SELECT id, "applicantId", "parsedData"
                       FROM "resumes_service"."Resume"
                       WHERE status = 'parsed' AND "confirmedAt" IS NOT NULL AND "supersededAt" IS NULL""")
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
            publish("resume.updated", {"resumeId": rid, "applicantId": applicant})
        print(f"queued re-matching for {len(resumes)} resumes")


if __name__ == "__main__":
    main()