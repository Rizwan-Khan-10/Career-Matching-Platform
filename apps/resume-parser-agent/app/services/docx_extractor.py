import io
import logging
import httpx
from docx import Document
import docx2txt

log = logging.getLogger("resume.docx")


def extract_text_from_docx_bytes(docx_bytes: bytes) -> str:
    try:
        # Primary method: python-docx (works for standard .docx files)
        doc = Document(io.BytesIO(docx_bytes))
        paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
        text = "\n".join(paragraphs)

        if text.strip():
            return text
    except Exception as e:
        log.warning("python-docx failed: %s", e)

    # Fallback method: docx2txt (sometimes catches text python-docx misses,
    # e.g. text inside tables or text boxes)
    try:
        return docx2txt.process(io.BytesIO(docx_bytes))
    except Exception as e:
        log.warning("docx2txt fallback also failed: %s", e)
        return ""


def extract_text_from_docx_url(file_url: str) -> str:
    resp = httpx.get(file_url, timeout=30)
    resp.raise_for_status()
    return extract_text_from_docx_bytes(resp.content)