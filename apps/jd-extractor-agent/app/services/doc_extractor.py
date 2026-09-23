import fitz
import httpx
import io
import pytesseract
from PIL import Image
from docx import Document
import docx2txt
from app.core.config import TESSERACT_PATH

pytesseract.pytesseract.tesseract_cmd = TESSERACT_PATH

IMAGE_EXTENSIONS = (".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".webp")


def extract_text_from_pdf_bytes(pdf_bytes: bytes) -> str:
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    text_parts = []

    for page in doc:
        page_text = page.get_text().strip()

        if page_text:
            text_parts.append(page_text)
        else:
            # Empty text -> likely a scanned/image page, fall back to OCR
            pix = page.get_pixmap(dpi=200)
            img_bytes = pix.tobytes("png")
            img = Image.open(io.BytesIO(img_bytes))
            ocr_text = pytesseract.image_to_string(img)
            text_parts.append(ocr_text)

    doc.close()
    return "\n".join(text_parts)


def extract_text_from_docx_bytes(docx_bytes: bytes) -> str:
    try:
        doc = Document(io.BytesIO(docx_bytes))
        paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
        text = "\n".join(paragraphs)
        if text.strip():
            return text
    except Exception as e:
        print(f"python-docx failed: {e}")

    try:
        return docx2txt.process(io.BytesIO(docx_bytes))
    except Exception as e:
        print(f"docx2txt fallback also failed: {e}")
        return ""


def extract_text_from_image_bytes(image_bytes: bytes) -> str:
    img = Image.open(io.BytesIO(image_bytes))
    return pytesseract.image_to_string(img)


def extract_text_from_url(file_url: str) -> str:
    """
    Downloads the file once, detects its type from the URL's extension,
    and routes to the correct extractor. Returns plain extracted text.
    """
    resp = httpx.get(file_url, timeout=30)

    if resp.status_code in (401, 403):
        raise ValueError(
            f"JD file URL is expired or unauthorized (status {resp.status_code}). "
            f"Signed URL may have expired before processing — ask job-service to reissue."
        )

    resp.raise_for_status()
    content = resp.content

    url_lower = file_url.lower().split("?")[0]

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
            "Legacy .doc format is not supported. Please ask the company to upload .docx, .pdf, or a scanned image instead."
        )
    else:
        raise ValueError(f"Unsupported file type for URL: {file_url}")