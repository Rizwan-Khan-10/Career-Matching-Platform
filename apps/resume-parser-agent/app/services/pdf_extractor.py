import fitz  # pymupdf
import httpx
import pytesseract
from PIL import Image
import io
from app.core.config import TESSERACT_PATH

pytesseract.pytesseract.tesseract_cmd = TESSERACT_PATH


def extract_text_from_pdf_bytes(pdf_bytes: bytes) -> str:
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    text_parts = []

    for page in doc:
        page_text = page.get_text().strip()

        if page_text:
            # Normal text-based page
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


def extract_text_from_url(file_url: str) -> str:
    resp = httpx.get(file_url, timeout=30)
    resp.raise_for_status()
    return extract_text_from_pdf_bytes(resp.content)