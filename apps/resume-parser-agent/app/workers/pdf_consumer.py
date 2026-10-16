"""Consumes 'match.approved' (applicant agreed to share their resume with a company).

 1. find the resume the match was computed on (match.resumeId; older events without it -> the applicant's ACTIVE resume)
 2. make sure a PDF of it exists (already a PDF -> reuse it, otherwise convert + store as resumes/<applicantId>/pdf/<resumeId>.pdf)
 3. publish 'resume.pdf.ready' (-> results-service e-mails the company and unlocks the download)
    or 'resume.pdf.failed' when the file can't be converted

Idempotent: the converted PDF has a fixed id per resume, so redelivery / retries never create duplicates.
Active resume (contract §4.9) = status 'parsed' AND confirmedAt IS NOT NULL AND supersededAt IS NULL.
"""
import logging

from app.core.logging_setup import bind_request_id
from app.core.redis_stream import consume_loop, publish
from app.services.pdf_converter import ConversionError, to_pdf
from app.services import pdf_storage

log = logging.getLogger("resume.pdf")

_BY_ID_SQL = """
    SELECT id, "applicantId", "cloudinaryPublicId", "pdfPublicId" FROM "resumes_service"."Resume"
    WHERE id = %s AND "applicantId" = %s
"""
_ACTIVE_SQL = """
    SELECT id, "applicantId", "cloudinaryPublicId", "pdfPublicId" FROM "resumes_service"."Resume"
    WHERE "applicantId" = %s AND status = 'parsed' AND "confirmedAt" IS NOT NULL AND "supersededAt" IS NULL
    ORDER BY "confirmedAt" DESC, "createdAt" DESC LIMIT 1
"""
_IDS = ("matchId", "applicantId", "jobRoleId")


# ----------------------------------------------------------------- db helpers (patched in tests)
def _load_resume(resume_id, applicant_id):
    from app.core.db import get_connection
    conn = get_connection()
    try:
        cur = conn.cursor()
        if resume_id:   # the resume the match was computed on (it may be superseded by now; the company still needs that file)
            cur.execute(_BY_ID_SQL, (resume_id, applicant_id))
        else:           # match without a resumeId (older rows): the applicant's active resume
            cur.execute(_ACTIVE_SQL, (applicant_id,))
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


def _payload(data: dict, resume: dict, pdf_id: str, request_id: str) -> dict:
    return {
        "matchId": data["matchId"],
        "resumeId": resume["id"],
        "applicantId": data["applicantId"],
        "jobRoleId": data["jobRoleId"],
        "pdfPublicId": pdf_id,
        "fileName": pdf_storage.friendly_pdf_name(resume["cloudinaryPublicId"]),
        "requestId": request_id,
    }


def handle(data: dict):
    for key in _IDS:
        if not data.get(key):
            raise ValueError(f"match.approved event is missing '{key}'")  # malformed -> goes straight to dead letter
    request_id = bind_request_id(data.get("requestId"))
    ids = {k: data[k] for k in _IDS}

    resume = _load_resume(data.get("resumeId"), data["applicantId"])
    if not resume:
        log.warning("match %s: resume not found", data["matchId"])
        publish("resume.pdf.failed", {**ids, "reason": "resume not found", "requestId": request_id})
        return
    try:
        pdf_id, how = ensure_pdf(resume)
    except ConversionError as exc:                # corrupt/unsupported file: retrying can never help
        log.warning("resume %s could not be converted: %s", resume["id"], exc)
        publish("resume.pdf.failed", {**ids, "reason": str(exc)[:300], "requestId": request_id})
        return
    log.info("resume %s -> pdf (%s)", resume["id"], how)
    publish("resume.pdf.ready", _payload(data, resume, pdf_id, request_id))


def on_dead(data: dict, error: Exception):
    """Infrastructure kept failing (Cloudinary down, ...): tell results-service so the UI doesn't wait forever."""
    publish("resume.pdf.failed", {
        **{k: data.get(k) for k in _IDS},
        "reason": f"gave up after retries: {str(error)[:200]}",
        "requestId": data.get("requestId"),
    })


def run():
    consume_loop("match.approved", "resume-pdf-group", "pdf-1", handle, on_dead=on_dead)