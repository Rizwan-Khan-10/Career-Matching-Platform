"""Cloudinary access for the PDF delivery step. Resumes are stored as PRIVATE raw files, so every read goes
through a short-lived signed URL (same scheme as resume-service's StorageService)."""
import io
import re
import time

from app.core import config

_configured = False


def _cloudinary():
    """Lazy import/config: the module can be imported (and unit-tested) without the cloudinary package."""
    global _configured
    import cloudinary
    import cloudinary.uploader
    import cloudinary.utils
    if not _configured:
        cloudinary.config(
            cloud_name=config.CLOUDINARY_CLOUD_NAME,
            api_key=config.CLOUDINARY_API_KEY,
            api_secret=config.CLOUDINARY_API_SECRET,
            secure=True,
        )
        _configured = True
    return cloudinary


def original_extension(public_id: str) -> str:
    """resume-service builds public ids as resumes/<applicant>/<timestamp>-<original file name>."""
    name = public_id.rsplit("/", 1)[-1]
    return name.rsplit(".", 1)[-1].lower() if "." in name else "pdf"


def friendly_pdf_name(public_id: str) -> str:
    """'resumes/u1/1700000-Asha CV.docx' -> 'Asha_CV.pdf' (what the company sees as the attachment name)."""
    name = public_id.rsplit("/", 1)[-1]
    name = re.sub(r"^\d{10,}-", "", name)                 # drop the upload timestamp
    base = name.rsplit(".", 1)[0] if "." in name else name
    base = re.sub(r"[^A-Za-z0-9._-]+", "_", base).strip("_") or "Resume"
    return f"{base[:80]}.pdf"


def signed_url(public_id: str, fmt: str, expires_in: int = 900) -> str:
    c = _cloudinary()
    return c.utils.private_download_url(
        public_id, fmt, resource_type="raw", type="private", expires_at=int(time.time()) + expires_in
    )


def download_original(public_id: str) -> bytes:
    import httpx
    url = signed_url(public_id, original_extension(public_id))
    resp = httpx.get(url, timeout=60)
    if resp.status_code in (401, 403, 404):
        raise ValueError(f"original resume file is not available (status {resp.status_code})")
    resp.raise_for_status()
    return resp.content


def upload_pdf(public_id: str, pdf_bytes: bytes) -> None:
    c = _cloudinary()
    c.uploader.upload(
        io.BytesIO(pdf_bytes),
        resource_type="raw",
        type="private",
        public_id=public_id,
        overwrite=True,
    )