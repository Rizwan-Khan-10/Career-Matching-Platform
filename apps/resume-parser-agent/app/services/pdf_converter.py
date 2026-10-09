"""Turns an uploaded resume (any supported format) into a PDF so it can be sent to a company.

    to_pdf(data, filename) -> (pdf_bytes, how)

how:
  "original"      already a PDF -> returned untouched (nothing is re-rendered, layout stays 100% intact)
  "libreoffice"   DOC/DOCX/ODT/RTF rendered by headless LibreOffice (best fidelity)
  "docx-basic"    DOCX fallback when LibreOffice is not installed: text/headings/tables re-laid-out with reportlab
  "image"         PNG/JPG/WEBP/... placed on an A4 page
  "text"          plain .txt typeset on A4

The file type is detected from the CONTENT (magic bytes) first and the file name second, so a PDF that was
uploaded as "resume.docx" (or the other way round) is still handled correctly.
"""
import io
import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from xml.sax.saxutils import escape

SOFFICE_PATH = os.getenv("SOFFICE_PATH", "soffice")   # Windows: C:\Program Files\LibreOffice\program\soffice.exe
SOFFICE_TIMEOUT_SECONDS = int(os.getenv("SOFFICE_TIMEOUT_SECONDS", "120"))
MAX_BYTES = int(os.getenv("PDF_MAX_INPUT_BYTES", str(15 * 1024 * 1024)))

IMAGE_EXT = {"jpg", "jpeg", "png", "bmp", "tif", "tiff", "webp", "gif"}
OFFICE_EXT = {"doc", "docx", "odt", "rtf"}


class ConversionError(ValueError):
    """Content-level failure: retrying can never help (corrupt / unsupported file)."""


# ---------------------------------------------------------------- detection
def detect_kind(data: bytes, filename: str = "") -> str:
    head = data[:16]
    ext = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""
    if head.startswith(b"%PDF") or b"%PDF-" in data[:1024]:
        return "pdf"
    if head.startswith(b"\x89PNG") or head.startswith(b"\xff\xd8\xff") or head[:4] == b"GIF8" or head[:2] == b"BM" \
            or head[:4] in (b"II*\x00", b"MM\x00*") or (head[:4] == b"RIFF" and data[8:12] == b"WEBP"):
        return "image"
    if head.startswith(b"{\\rtf"):
        return "rtf"
    if head.startswith(b"PK\x03\x04"):                       # zip container: docx / odt / ...
        if ext == "odt":
            return "odt"
        return "docx"
    if head.startswith(b"\xd0\xcf\x11\xe0"):                  # OLE2: legacy .doc
        return "doc"
    if ext in IMAGE_EXT:
        return "image"
    if ext in ("txt", "text", "md"):
        return "text"
    # no known signature: if it decodes as text treat it as text, otherwise give up
    try:
        data[:4096].decode("utf-8")
        if ext in ("", "txt"):
            return "text"
    except UnicodeDecodeError:
        pass
    return "unknown"


# ---------------------------------------------------------------- converters
def _image_to_pdf(data: bytes) -> bytes:
    from PIL import Image, ImageOps
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.utils import ImageReader
    from reportlab.pdfgen import canvas

    try:
        img = Image.open(io.BytesIO(data))
        img = ImageOps.exif_transpose(img)           # phone photos: respect the rotation flag
        img = img.convert("RGB")
    except Exception as exc:
        raise ConversionError(f"image could not be read: {exc}") from exc

    page_w, page_h = A4
    margin = 24
    scale = min((page_w - 2 * margin) / img.width, (page_h - 2 * margin) / img.height)
    w, h = img.width * scale, img.height * scale
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    c.drawImage(ImageReader(img), (page_w - w) / 2, (page_h - h) / 2, width=w, height=h)
    c.showPage()
    c.save()
    return buf.getvalue()


def _paragraphs_to_pdf(blocks: list) -> bytes:
    """blocks: [(style_name, text)] with style in {'h','p','li','tbl'} -> simple, clean A4 PDF."""
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer

    styles = getSampleStyleSheet()
    body = ParagraphStyle("body", parent=styles["BodyText"], fontName="Helvetica", fontSize=10, leading=13.5)
    head = ParagraphStyle("head", parent=body, fontName="Helvetica-Bold", fontSize=12, leading=16, spaceBefore=8, spaceAfter=3)
    bullet = ParagraphStyle("bullet", parent=body, leftIndent=14, bulletIndent=3)

    story = []
    for kind, text in blocks:
        t = escape(text).strip()
        if not t:
            story.append(Spacer(1, 5))
        elif kind == "h":
            story.append(Paragraph(t, head))
        elif kind == "li":
            story.append(Paragraph(t, bullet, bulletText="•"))
        else:
            story.append(Paragraph(t, body))
    if not story:
        raise ConversionError("document has no readable text")

    buf = io.BytesIO()
    SimpleDocTemplate(buf, pagesize=A4, leftMargin=48, rightMargin=48, topMargin=48, bottomMargin=48).build(story)
    return buf.getvalue()


def _text_to_pdf(data: bytes) -> bytes:
    text = data.decode("utf-8", errors="replace")
    return _paragraphs_to_pdf([("p", line) for line in text.splitlines()])


def _docx_basic_to_pdf(data: bytes) -> bytes:
    """No-LibreOffice fallback: keeps the text, headings, bullets and tables, not the original styling."""
    try:
        from docx import Document
        doc = Document(io.BytesIO(data))
    except Exception as exc:
        raise ConversionError(f"docx could not be read: {exc}") from exc

    blocks = []
    for p in doc.paragraphs:
        style = (p.style.name or "").lower() if p.style is not None else ""
        text = p.text
        if style.startswith("heading") or style == "title":
            blocks.append(("h", text))
        elif "list" in style:
            blocks.append(("li", text))
        else:
            blocks.append(("p", text))
    for table in doc.tables:
        for row in table.rows:
            cells = []
            for cell in row.cells:
                t = cell.text.strip()
                if t and t not in cells:
                    cells.append(t)
            if cells:
                blocks.append(("p", "  |  ".join(cells)))
    return _paragraphs_to_pdf(blocks)


def _libreoffice_to_pdf(data: bytes, kind: str) -> bytes:
    exe = shutil.which(SOFFICE_PATH) or (SOFFICE_PATH if os.path.exists(SOFFICE_PATH) else None)
    if not exe:
        raise FileNotFoundError(f"LibreOffice not found ({SOFFICE_PATH})")
    with tempfile.TemporaryDirectory(prefix="resume2pdf_") as tmp:
        tmp_path = Path(tmp)
        src = tmp_path / f"resume.{kind}"
        src.write_bytes(data)
        profile = (tmp_path / "lo_profile").as_uri()   # private profile dir: parallel runs / stale locks can't collide
        cmd = [exe, f"-env:UserInstallation={profile}", "--headless", "--norestore", "--nolockcheck",
               "--convert-to", "pdf", "--outdir", str(tmp_path), str(src)]
        try:
            proc = subprocess.run(cmd, capture_output=True, timeout=SOFFICE_TIMEOUT_SECONDS)
        except subprocess.TimeoutExpired as exc:
            raise ConversionError("LibreOffice timed out converting this document") from exc
        out = tmp_path / "resume.pdf"
        if not out.exists() or not out.read_bytes().startswith(b"%PDF"):
            raise ConversionError(
                f"LibreOffice could not convert this document (exit {proc.returncode}): "
                f"{(proc.stderr or proc.stdout or b'').decode(errors='ignore')[:300]}"
            )
        return out.read_bytes()


# ---------------------------------------------------------------- public API
def to_pdf(data: bytes, filename: str = ""):
    if not data:
        raise ConversionError("file is empty")
    if len(data) > MAX_BYTES:
        raise ConversionError(f"file is too large ({len(data) // 1024 // 1024} MB)")

    kind = detect_kind(data, filename)
    if kind == "pdf":
        return data, "original"
    if kind == "image":
        return _image_to_pdf(data), "image"
    if kind == "text":
        return _text_to_pdf(data), "text"
    if kind in ("docx", "doc", "odt", "rtf"):
        try:
            return _libreoffice_to_pdf(data, kind), "libreoffice"
        except FileNotFoundError:
            if kind == "docx":
                return _docx_basic_to_pdf(data), "docx-basic"
            raise ConversionError(f".{kind} files need LibreOffice on the server (set SOFFICE_PATH)")
    raise ConversionError(f"unsupported file type ({filename or 'unknown name'})")