import json
import logging

from app.core.db import get_connection
from app.core.embeddings import embed, to_pgvector
from app.core.logging_setup import bind_request_id
from app.core.redis_stream import consume_loop, publish
from app.models.resume import ResumeUploadedEvent
from app.services.file_router import extract_text
from app.services.profile_text import resume_profile_text
from app.services.resume_parser import parse_resume

log = logging.getLogger("resume.parser")


def ensure_embedding_table():
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS resume_embeddings (
                resume_id UUID PRIMARY KEY,
                embedding VECTOR(384)
            );
        """)
        conn.commit()
        cur.close()
    finally:
        conn.close()


def mark_failed(resume_id: str, reason: str):
    if not resume_id:
        return
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            'UPDATE "resumes_service"."Resume" SET status = %s, "parsedData" = %s, "updatedAt" = NOW() WHERE id = %s',
            ("failed", json.dumps({"error": reason}), resume_id),
        )
        conn.commit()
        cur.close()
    finally:
        conn.close()


def on_dead(data: dict, error: Exception):
    """Called when a message failed MAX_DELIVERIES times (e.g. Groq down) so it never sits on 'pending' forever."""
    mark_failed(data.get("resumeId", ""), f"Processing failed after several attempts: {error}")


def handle(data: dict):
    event = ResumeUploadedEvent(**data)  # validates incoming event shape
    request_id = bind_request_id(event.requestId)
    log.info("parsing resume %s", event.resumeId)

    # Content-level failures (bad file, unsupported format, expired URL, bad LLM output) can never succeed on
    # retry, so we mark the resume "failed" and ack the message instead of retrying forever on "pending".
    try:
        text = extract_text(event.fileUrl)
        if not text or not text.strip():
            raise ValueError(f"No text could be extracted from resume {event.resumeId}")
        parsed = parse_resume(text)  # validated ParsedResumeData (incl. branch / passingYear / backlogs)
    except ValueError as e:   # includes json.JSONDecodeError and pydantic ValidationError
        log.warning("resume %s marked failed (content error)", event.resumeId)
        mark_failed(event.resumeId, f"Could not parse resume content: {e}")
        return

    # Embed the STRUCTURED profile (same builder as the role side), not the first 2000 raw characters.
    vector = embed(resume_profile_text(parsed.model_dump()))

    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            'UPDATE "resumes_service"."Resume" SET status = %s, "parsedData" = %s, "updatedAt" = NOW() WHERE id = %s',
            ("parsed", parsed.model_dump_json(), event.resumeId),
        )
        cur.execute(
            "INSERT INTO resume_embeddings (resume_id, embedding) VALUES (%s, %s::vector) "
            "ON CONFLICT (resume_id) DO UPDATE SET embedding = EXCLUDED.embedding",
            (event.resumeId, to_pgvector(vector)),
        )
        conn.commit()
        cur.close()
    finally:
        conn.close()

    # UI / notification only ("review and confirm"). Matching starts at resume.confirmed, NOT here.
    publish("resume.parsed", {
        "resumeId": event.resumeId,
        "applicantId": event.applicantId,
        **parsed.model_dump(),
        "requestId": request_id,
    })
    log.info("resume %s parsed", event.resumeId)


def run():
    ensure_embedding_table()
    consume_loop("resume.uploaded", "resume-parser-group", "consumer-1", handle, on_dead=on_dead)