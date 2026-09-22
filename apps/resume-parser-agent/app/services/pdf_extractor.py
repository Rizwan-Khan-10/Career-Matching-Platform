import fitz  # pymupdf
import httpx

def extract_text_from_url(file_url: str) -> str:
    resp = httpx.get(file_url, timeout=30)
    resp.raise_for_status()
    doc = fitz.open(stream=resp.content, filetype="pdf")
    text = "\n".join(page.get_text() for page in doc)
    doc.close()
    return text