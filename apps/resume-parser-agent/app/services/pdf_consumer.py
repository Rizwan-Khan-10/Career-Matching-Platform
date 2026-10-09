"""Consumes 'match.approved' (applicant agreed to share their resume with a company).

 1. find the resume the match was computed on
 2. make sure a PDF of it exists (already a PDF -> reuse it, otherwise convert + store)
 3. publish 'resume.pdf.ready' (-> results-service e-mails the company and unlocks the download)
    or 'resume.pdf.failed' when the file can't be converted

Idempotent: the converted PDF has a fixed id per resume, so redelivery / retries never create duplicates.
"""
import logging

from app.core.redis_stream import consume_loop, publish
from app.services.pdf_converter import ConversionError, to_pdf
from app.services import pdf_storage

log = logging.getLogger("resume.pdf")


# ----------------------------------------------------------------- db helpers (patched in tests)
def _load_resume(resume_id, applicant_id):
    from app.core.db import get_connection
    conn = get_connection()
    try:
        cur = conn.cursor()
        if resume_id:
            cur.execute('SELECT id, "applicantId", "cloudinaryPublicId", "pdfPublicId" FROM "resumes_service"."Resume" WHERE id = %s', (resume_id,))
        else:  # match without a resumeId (older rows): fall back to the applicant's latest parsed resume
            cur.execute(
                'SELECT id, "applicantId", "cloudinaryPublicId", "pdfPublicId" FROM "resumes_service"."Resume" '
                "WHERE \"applicantId\" = %s AND status = 'parsed' ORDER BY \"createdAt\" DESC LIMIT 1", (applicant_id,))
        row = cur.fetchone()
        cur.close()
    finally:
        conn.close()
    if not row:
        return None
    return {"id": row[0], "applicantId": row[1], "cloudinaryPublicId": row[2], "pdfPublicId": row[3]}


def _save_pdf_public_id(resume_id, pdf_public_id):
    from app.core.db import get_connection
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute('UPDATE "resumes_service"."Resume" SET "pdfPublicId" = %s WHERE id = %s', (pdf_public_id, resume_id))
        conn.commit()
        cur.close()
    finally:
        conn.close()


# ----------------------------------------------------------------- core
def ensure_pdf(resume: dict):
    """-> (pdf_public_id, how). how = 'cached' | 'original' | 'libreoffice' | 'docx-basic' | 'image' | 'text'."""
    if resume.get("pdfPublicId"):
        return resume["pdfPublicId"], "cached"

    original_id = resume["cloudinaryPublicId"]
    data = pdf_storage.download_original(original_id)
    pdf_bytes, how = to_pdf(data, original_id.rsplit("/", 1)[-1])

    if how == "original":
        pdf_id = original_id                      # it already IS a PDF: nothing to upload
    else:
        pdf_id = f"resumes/{resume['applicantId']}/pdf/{resume['id']}.pdf"
        pdf_storage.upload_pdf(pdf_id, pdf_bytes)
    _save_pdf_public_id(resume["id"], pdf_id)
    return pdf_id, how


def _payload(data: dict, resume: dict, pdf_id: str) -> dict:
    return {
        "matchId": data["matchId"],
        "resumeId": resume["id"],
        "applicantId": data["applicantId"],
        "jobRoleId": data["jobRoleId"],
        "pdfPublicId": pdf_id,
        "fileName": pdf_storage.friendly_pdf_name(resume["cloudinaryPublicId"]),
    }


def handle(data: dict):
    for key in ("matchId", "applicantId", "jobRoleId"):
        if not data.get(key):
            raise ValueError(f"match.approved event is missing '{key}'")  # malformed -> goes straight to dead letter

    resume = _load_resume(data.get("resumeId"), data["applicantId"])
    if not resume:
        publish("resume.pdf.failed", {**{k: data[k] for k in ("matchId", "applicantId", "jobRoleId")}, "reason": "resume not found"})
        return
    try:
        pdf_id, how = ensure_pdf(resume)
    except ConversionError as exc:                # corrupt/unsupported file: retrying can never help
        log.warning("resume %s could not be converted: %s", resume["id"], exc)
        publish("resume.pdf.failed", {**{k: data[k] for k in ("matchId", "applicantId", "jobRoleId")}, "reason": str(exc)[:300]})
        return
    log.info("resume %s -> pdf (%s)", resume["id"], how)
    publish("resume.pdf.ready", _payload(data, resume, pdf_id))


def on_dead(data: dict, error: Exception):
    """Infrastructure kept failing (Cloudinary down, ...): tell results-service so the UI doesn't wait forever."""
    publish("resume.pdf.failed", {**{k: data.get(k) for k in ("matchId", "applicantId", "jobRoleId")}, "reason": f"gave up after retries: {str(error)[:200]}"})


def run():
    consume_loop("match.approved", "resume-pdf-group", "pdf-1", handle, on_dead=on_dead)