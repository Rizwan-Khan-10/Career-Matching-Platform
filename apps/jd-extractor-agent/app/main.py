import logging
import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import JSONResponse

from app.core.config import ENABLE_DOCS, ENABLE_JD_EXTRACTOR_CONSUMER
from app.core.logging_setup import setup_logging

setup_logging()
log = logging.getLogger("jd.main")

# status: "starting" | "running" | "failed" | "disabled"
_consumers: dict = {
    "jd_extractor": {"status": "starting", "error": None, "thread": None},
}


def _load_run():
    from app.workers.stream_consumer import run
    return run


def _supervise(name: str, enabled: bool, load_run):
    """Runs the consumer loop (blocks forever). If it ever stops, /health turns degraded."""
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
    t = threading.Thread(target=_supervise, args=("jd_extractor", ENABLE_JD_EXTRACTOR_CONSUMER, _load_run),
                         daemon=True, name="jd_extractor")
    _consumers["jd_extractor"]["thread"] = t
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
    """503 {"status": "degraded"} when the consumer failed to start or its thread died (contract §3.5)."""
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