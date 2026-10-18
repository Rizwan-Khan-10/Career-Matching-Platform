import logging
import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import JSONResponse

from app.core import health_state
from app.core.config import ENABLE_DOCS, ENABLE_FEEDBACK_CONSUMER
from app.core.logging_setup import setup_logging

setup_logging()
log = logging.getLogger("feedback.main")


def start_consumer():
    """Runs forever (blocks) in its own thread. A startup failure or a dead consumer turns /health into 503."""
    if not ENABLE_FEEDBACK_CONSUMER:
        health_state.set_startup("disabled")
        return
    try:
        from app.workers.stream_consumer import run
        health_state.set_startup("running")
        run()
        health_state.set_startup("failed", "consumer threads exited")
    except Exception as exc:  # pragma: no cover - startup guard only
        health_state.set_startup("failed", exc)
        log.exception("Feedback consumer startup failed")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    threading.Thread(target=start_consumer, daemon=True, name="feedback-consumer").start()
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
    """503 {"status": "degraded"} when the consumers failed to start or a consumer thread died (contract section 3, rule 5)."""
    failed = health_state.failures()
    body = {"status": "degraded" if failed else "ok", **health_state.snapshot()}
    if failed:
        body["errors"] = failed
    return JSONResponse(status_code=503 if failed else 200, content=body)
