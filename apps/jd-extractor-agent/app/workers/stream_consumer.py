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

def handle(data: dict):
    event = JdUploadedEvent(**data)  # validates incoming event shape

    text = extract_text_from_url(event.fileUrl)

    if not text or not text.strip():
        raise ValueError(f"No text could be extracted from JD {event.jobPostingId} ({event.fileUrl})")

    parsed = parse_jd(text)  # returns a validated ParsedJdData object

    conn = get_connection()
    cur = conn.cursor()
    role_ids = []
    for role in parsed.roles:
        role_id = str(uuid.uuid4())
        cur.execute(
            'INSERT INTO "jobs"."JobRole" (id, "jobPostingId", title, requirements, "createdAt") '
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

    cur.execute('UPDATE "jobs"."JobPosting" SET status = %s WHERE id = %s', ("extracted", event.jobPostingId))
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