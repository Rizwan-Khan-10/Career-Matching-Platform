import logging
import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import JSONResponse

from app.core.config import ENABLE_DOCS, ENABLE_RESUME_PARSER_CONSUMER, ENABLE_RESUME_PDF_CONSUMER
from app.core.logging_setup import setup_logging

setup_logging()
log = logging.getLogger("resume.main")

# status: "starting" | "running" | "failed" | "disabled"
_consumers: dict = {
    "resume_parser": {"status": "starting", "error": None, "thread": None},
    "resume_pdf": {"status": "starting", "error": None, "thread": None},
}


def _load_parser_run():
    from app.workers.stream_consumer import run
    return run


def _load_pdf_run():
    from app.workers.pdf_consumer import run
    return run


def _supervise(name: str, enabled: bool, load_run):
    """Runs one consumer loop (blocks forever). If it ever stops, /health turns degraded."""
    state = _consumers[name]
    if not enabled:
        state["status"] = "disabled"
        return
    state["status"] = "running"
    try:
        load_run()()
        state.update(status="failed", error="consumer loop exited")
    except Exception as exc:
        state.update(status="failed", error=str(exc)[:300])
        log.exception("%s consumer died", name)


def start_consumers():
    specs = (
        ("resume_parser", ENABLE_RESUME_PARSER_CONSUMER, _load_parser_run),
        ("resume_pdf", ENABLE_RESUME_PDF_CONSUMER, _load_pdf_run),
    )
    for name, enabled, loader in specs:
        t = threading.Thread(target=_supervise, args=(name, enabled, loader), daemon=True, name=name)
        _consumers[name]["thread"] = t
        t.start()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    start_consumers()
    yield


app = FastAPI(
    lifespan=lifespan,
    docs_url="/docs" if ENABLE_DOCS else None,
    redoc_url=None,
    openapi_url="/openapi.json" if ENABLE_DOCS else None,
)


@app.get("/")
@app.get("/health")
def health():
    """503 {"status": "degraded"} when a consumer failed to start or its thread died (contract §3.5)."""
    failed = {}
    for name, state in _consumers.items():
        thread = state["thread"]
        died = state["status"] == "running" and thread is not None and not thread.is_alive()
        if state["status"] == "failed" or died:
            failed[name] = state["error"] or "consumer thread died"
    body = {"status": "degraded" if failed else "ok", "consumers": {n: s["status"] for n, s in _consumers.items()}}
    if failed:
        body["errors"] = failed
    return JSONResponse(status_code=503 if failed else 200, content=body)