from app.core.redis_stream import consume_loop, publish
from app.core.db import get_connection
from app.core.embeddings import embed
from app.services.file_router import extract_text
from app.services.resume_parser import parse_resume
from app.models.resume import ResumeUploadedEvent
import json

def ensure_embedding_table():
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS resume_embeddings (
            resume_id UUID PRIMARY KEY,
            embedding VECTOR(384)
        );
    """)
    conn.commit()
    cur.close()
    conn.close()

def handle(data: dict):
    event = ResumeUploadedEvent(**data)  # validates incoming event shape

    text = extract_text(event.fileUrl)

    if not text or not text.strip():
        raise ValueError(f"No text could be extracted from resume {event.resumeId} ({event.fileUrl})")

    parsed = parse_resume(text)  # returns a validated ParsedResumeData object
    vector = embed(text[:2000])

    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        'UPDATE "resumes"."Resume" SET status = %s, "parsedData" = %s, "updatedAt" = NOW() WHERE id = %s',
        ("parsed", parsed.model_dump_json(), event.resumeId),
    )
    cur.execute(
        "INSERT INTO resume_embeddings (resume_id, embedding) VALUES (%s, %s) "
        "ON CONFLICT (resume_id) DO UPDATE SET embedding = EXCLUDED.embedding",
        (event.resumeId, vector),
    )
    conn.commit()
    cur.close()
    conn.close()

    publish("resume.parsed", {
        "resumeId": event.resumeId,
        "applicantId": event.applicantId,
        **parsed.model_dump(),
    })

def run():
    ensure_embedding_table()
    consume_loop("resume.uploaded", "resume-parser-group", "consumer-1", handle)