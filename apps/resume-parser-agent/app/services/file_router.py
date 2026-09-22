import httpx
import pytesseract
from PIL import Image
import io
from app.core.config import TESSERACT_PATH
from app.services.pdf_extractor import extract_text_from_pdf_bytes
from app.services.docx_extractor import extract_text_from_docx_bytes

pytesseract.pytesseract.tesseract_cmd = TESSERACT_PATH

IMAGE_EXTENSIONS = (".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".webp")


def extract_text_from_image_bytes(image_bytes: bytes) -> str:
    img = Image.open(io.BytesIO(image_bytes))
    return pytesseract.image_to_string(img)


def extract_text(file_url: str) -> str:
    resp = httpx.get(file_url, timeout=30)

    if resp.status_code in (401, 403):
        raise ValueError(
            f"Resume URL is expired or unauthorized (status {resp.status_code}). "
            f"Signed URL may have expired before processing — ask resume-service to reissue."
        )

    resp.raise_for_status()
    content = resp.content

    url_lower = file_url.lower().split("?")[0]  # strip query params before checking extension

    if url_lower.endswith(".pdf"):
        return extract_text_from_pdf_bytes(content)

    elif url_lower.endswith(".docx"):
        return extract_text_from_docx_bytes(content)

    elif url_lower.endswith(".txt"):
        return content.decode("utf-8", errors="ignore")

    elif url_lower.endswith(IMAGE_EXTENSIONS):
        return extract_text_from_image_bytes(content)

    elif url_lower.endswith(".doc"):
        raise ValueError(
            "Legacy .doc format is not supported. Please ask the applicant to upload .docx, .pdf, or a scanned image instead."
        )

    else:
        raise ValueError(f"Unsupported file type for URL: {file_url}")