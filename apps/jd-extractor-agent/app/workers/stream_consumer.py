from app.core.redis_stream import consume_loop, publish
from app.core.db import get_connection
from app.core.embeddings import embed, to_pgvector
from app.services.doc_extractor import extract_text_from_url
from app.services.jd_parser import parse_jd
from app.services.profile_text import role_profile_text
from app.models.jd import JdUploadedEvent
import json
import uuid


def ensure_embedding_table():
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS job_role_embeddings (
            job_role_id UUID PRIMARY KEY,
            embedding VECTOR(384)
        );
    """)
    conn.commit()
    cur.close()
    conn.close()


def mark_failed(job_posting_id: str, reason: str):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        'UPDATE "jobs_service"."JobPosting" SET status = %s, "errorMessage" = %s WHERE id = %s',
        ("failed", reason, job_posting_id),
    )
    conn.commit()
    cur.close()
    conn.close()


def get_posting_state(job_posting_id: str):
    """-> (status, stopped) or None when the posting no longer exists."""
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute('SELECT status, "stoppedAt" FROM "jobs_service"."JobPosting" WHERE id = %s', (job_posting_id,))
        row = cur.fetchone()
        cur.close()
    finally:
        conn.close()
    return (row[0], row[1] is not None) if row else None


def on_dead(data: dict, error: Exception):
    mark_failed(data.get("jobPostingId", ""), f"Processing failed after several attempts: {error}")


def handle(data: dict):
    event = JdUploadedEvent(**data)  # validates incoming event shape

    # The company can stop a job at any time. A stopped job is NOT scanned (saves the download + LLM call),
    # and an already extracted one is never processed twice (redelivery / reopen races).
    state = get_posting_state(event.jobPostingId)
    if state is None:
        print(f"jd.uploaded for unknown posting {event.jobPostingId}, ignoring")
        return
    status, stopped = state
    if stopped:
        print(f"job {event.jobPostingId} is stopped, skipping scan")
        return
    if status == "extracted":
        return

    # Content-level failures can never succeed on retry -> mark "failed" and ack.
    try:
        text = extract_text_from_url(event.fileUrl)
        if not text or not text.strip():
            raise ValueError(f"No text could be extracted from JD {event.jobPostingId} ({event.fileUrl})")
        parsed = parse_jd(text)  # validated ParsedJdData with >= 1 usable role (else ValueError)
    except ValueError as e:
        mark_failed(event.jobPostingId, str(e))
        return
    except json.JSONDecodeError as e:
        mark_failed(event.jobPostingId, f"Could not parse job document content: {e}")
        return

    conn = get_connection()
    cur = conn.cursor()
    role_ids = []
    try:
        # Re-check under a row lock: the company may have pressed "stop" while the LLM was reading the document,
        # or another worker may have finished the same posting. Either way: write nothing, announce nothing.
        cur.execute('SELECT status, "stoppedAt" FROM "jobs_service"."JobPosting" WHERE id = %s FOR UPDATE', (event.jobPostingId,))
        locked = cur.fetchone()
        if locked is None or locked[1] is not None or locked[0] == "extracted":
            conn.rollback()
            print(f"job {event.jobPostingId} was stopped/finished while scanning, discarding the result")
            return

        for role in parsed.roles:
            role_id = str(uuid.uuid4())
            cur.execute(
                'INSERT INTO "jobs_service"."JobRole" (id, "jobPostingId", title, requirements, "createdAt") '
                'VALUES (%s, %s, %s, %s, NOW())',
                (role_id, event.jobPostingId, role.title, role.model_dump_json()),
            )
            # structured profile text, built exactly like the resume side (matching-agent re-checks it as well)
            vector = embed(role_profile_text(role.title, role.model_dump()))
            cur.execute(
                "INSERT INTO job_role_embeddings (job_role_id, embedding) VALUES (%s, %s::vector) "
                "ON CONFLICT (job_role_id) DO UPDATE SET embedding = EXCLUDED.embedding",
                (role_id, to_pgvector(vector)),
            )
            role_ids.append(role_id)

        cur.execute('UPDATE "jobs_service"."JobPosting" SET status = %s WHERE id = %s', ("extracted", event.jobPostingId))
        conn.commit()
    except Exception:
        conn.rollback()   # nothing half-written: a retry starts clean instead of duplicating roles
        raise
    finally:
        cur.close()
        conn.close()

    publish("jd.extracted", {
        "jobPostingId": event.jobPostingId,
        "companyId": event.companyId,
        "roleIds": role_ids,
    })


def run():
    ensure_embedding_table()
    consume_loop("jd.uploaded", "jd-extractor-group", "consumer-1", handle, on_dead=on_dead)