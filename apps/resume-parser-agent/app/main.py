import os
import threading
from fastapi import FastAPI

app = FastAPI()


@app.get("/")
@app.get("/health")
def health():
    return {"status": "ok"}


def start_consumer():
    if os.getenv("ENABLE_RESUME_PARSER_CONSUMER", "true").lower() != "true":
        return
    try:
        from app.workers.stream_consumer import run
        run()
    except Exception as exc:
        print(f"Resume-parser consumer startup failed: {exc}")


def start_pdf_consumer():
    if os.getenv("ENABLE_RESUME_PDF_CONSUMER", "true").lower() != "true":
        return
    try:
        from app.workers.pdf_consumer import run
        run()
    except Exception as exc:
        print(f"Resume-PDF consumer startup failed: {exc}")


threading.Thread(target=start_consumer, daemon=True).start()
threading.Thread(target=start_pdf_consumer, daemon=True).start()