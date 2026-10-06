import httpx
import pytesseract
from PIL import Image
import io
from urllib.parse import urlparse, parse_qs
from app.core.config import TESSERACT_PATH
from app.services.pdf_extractor import extract_text_from_pdf_bytes
from app.services.docx_extractor import extract_text_from_docx_bytes

pytesseract.pytesseract.tesseract_cmd = TESSERACT_PATH

IMAGE_EXTENSIONS = (".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".webp")
KNOWN_EXTENSIONS = (".pdf", ".docx", ".doc", ".txt", *IMAGE_EXTENSIONS)

CONTENT_TYPE_TO_EXT = {
    "application/pdf": ".pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "application/msword": ".doc",
    "text/plain": ".txt",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/bmp": ".bmp",
    "image/tiff": ".tiff",
    "image/webp": ".webp",
}


def extract_text_from_image_bytes(image_bytes: bytes) -> str:
    img = Image.open(io.BytesIO(image_bytes))
    return pytesseract.image_to_string(img)


def _detect_extension(file_url: str, content_type: str | None) -> str | None:
    """Figure out the real file type, in order of reliability:
    1. the `format` query param — Cloudinary's private/authenticated download
       URLs (https://api.cloudinary.com/.../raw/download?...&format=pdf&...)
       always have this path as literally "/raw/download" with no extension
       in it at all; the real type only ever shows up here.
    2. the URL path's own suffix — works for plain/public delivery URLs.
    3. the response's Content-Type header, as a last resort.
    """
    parsed = urlparse(file_url)
    query_format = parse_qs(parsed.query).get("format", [None])[0]
    if query_format:
        return f".{query_format.lower()}"

    path_lower = parsed.path.lower()
    for ext in KNOWN_EXTENSIONS:
        if path_lower.endswith(ext):
            return ext

    if content_type:
        return CONTENT_TYPE_TO_EXT.get(content_type.split(";")[0].strip().lower())

    return None


def extract_text(file_url: str) -> str:
    resp = httpx.get(file_url, timeout=30)

    if resp.status_code in (401, 403):
        raise ValueError(
            f"Resume URL is expired or unauthorized (status {resp.status_code}). "
            f"Signed URL may have expired before processing — ask resume-service to reissue."
        )

    resp.raise_for_status()
    content = resp.content

    extension = _detect_extension(file_url, resp.headers.get("content-type"))

    if extension == ".pdf":
        return extract_text_from_pdf_bytes(content)

    elif extension == ".docx":
        return extract_text_from_docx_bytes(content)

    elif extension == ".txt":
        return content.decode("utf-8", errors="ignore")

    elif extension in IMAGE_EXTENSIONS:
        return extract_text_from_image_bytes(content)

    elif extension == ".doc":
        raise ValueError(
            "Legacy .doc format is not supported. Please ask the applicant to upload .docx, .pdf, or a scanned image instead."
        )

    else:
        raise ValueError(f"Unsupported file type for URL: {file_url}")