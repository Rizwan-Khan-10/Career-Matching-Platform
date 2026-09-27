from app.core.redis_stream import consume_loop, publish
from app.core.db import get_connection
from app.core.embeddings import embed
from app.services.doc_extractor import extract_text_from_url
from app.services.jd_parser import parse_jd
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

def handle(data: dict):
    event = JdUploadedEvent(**data)  # validates incoming event shape

    # Content-level failures (bad file, unsupported format, expired URL, bad LLM
    # output) can never succeed on retry, so we mark the posting "failed" and ack
    # the message instead of letting it retry forever while stuck on "pending".
    try:
        text = extract_text_from_url(event.fileUrl)
        if not text or not text.strip():
            raise ValueError(f"No text could be extracted from JD {event.jobPostingId} ({event.fileUrl})")
        parsed = parse_jd(text)  # returns a validated ParsedJdData object
    except ValueError as e:
        mark_failed(event.jobPostingId, str(e))
        return
    except json.JSONDecodeError as e:
        mark_failed(event.jobPostingId, f"Could not parse job document content: {e}")
        return

    conn = get_connection()
    cur = conn.cursor()
    role_ids = []
    for role in parsed.roles:
        role_id = str(uuid.uuid4())
        cur.execute(
            'INSERT INTO "jobs_service"."JobRole" (id, "jobPostingId", title, requirements, "createdAt") '
            'VALUES (%s, %s, %s, %s, NOW())',
            (role_id, event.jobPostingId, role.title, role.model_dump_json()),
        )
        vector = embed(role.model_dump_json())
        cur.execute(
            "INSERT INTO job_role_embeddings (job_role_id, embedding) VALUES (%s, %s) "
            "ON CONFLICT (job_role_id) DO UPDATE SET embedding = EXCLUDED.embedding",
            (role_id, vector),
        )
        role_ids.append(role_id)

    cur.execute('UPDATE "jobs_service"."JobPosting" SET status = %s WHERE id = %s', ("extracted", event.jobPostingId))
    conn.commit()
    cur.close()
    conn.close()

    publish("jd.extracted", {
        "jobPostingId": event.jobPostingId,
        "companyId": event.companyId,
        "roleIds": role_ids,
    })

def run():
    ensure_embedding_table()
    consume_loop("jd.uploaded", "jd-extractor-group", "consumer-1", handle)