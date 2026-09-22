from app.core.redis_stream import consume_loop, publish
from app.core.db import get_connection
from app.core.embeddings import embed
from app.services.pdf_extractor import extract_text_from_url
from app.services.resume_parser import parse_resume
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
    resume_id = data["resumeId"]
    applicant_id = data["applicantId"]
    file_url = data["fileUrl"]

    text = extract_text_from_url(file_url)
    parsed = parse_resume(text)
    vector = embed(text[:2000])

    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        'UPDATE "resumes"."Resume" SET status = %s, "parsedData" = %s, "updatedAt" = NOW() WHERE id = %s',
        ("parsed", json.dumps(parsed), resume_id),
    )
    cur.execute(
        "INSERT INTO resume_embeddings (resume_id, embedding) VALUES (%s, %s) "
        "ON CONFLICT (resume_id) DO UPDATE SET embedding = EXCLUDED.embedding",
        (resume_id, vector),
    )
    conn.commit()
    cur.close()
    conn.close()

    publish("resume.parsed", {"resumeId": resume_id, "applicantId": applicant_id, **parsed})

def run():
    ensure_embedding_table()
    consume_loop("resume.uploaded", "resume-parser-group", "consumer-1", handle)