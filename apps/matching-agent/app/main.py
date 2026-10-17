import logging
import threading
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.responses import JSONResponse

from app.core import health_state
from app.core.config import ENABLE_DOCS, ENABLE_MATCHING_CONSUMER
from app.core.logging_setup import setup_logging
from app.core.security import require_internal_key

setup_logging()
log = logging.getLogger("matching.main")


def start_consumer():
    """Runs forever (blocks) in its own thread. A startup failure or a dead consumer turns /health into 503."""
    if not ENABLE_MATCHING_CONSUMER:
        health_state.set_startup("disabled")
        return
    try:
        from app.workers.stream_consumer import run
        health_state.set_startup("running")
        run()
        health_state.set_startup("failed", "consumer threads exited")
    except Exception as exc:
        health_state.set_startup("failed", exc)
        log.exception("Matching-agent consumer startup failed")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    threading.Thread(target=start_consumer, daemon=True, name="matching-consumer").start()
    yield


app = FastAPI(
    lifespan=lifespan,
    dependencies=[Depends(require_internal_key)],   # everything except /health and docs needs x-internal-key
    docs_url="/docs" if ENABLE_DOCS else None,
    redoc_url=None,
    openapi_url="/openapi.json" if ENABLE_DOCS else None,
)


@app.get("/")
@app.get("/health")
def health():
    """503 {"status": "degraded"} when the consumers failed to start or a consumer thread died (contract §3.5)."""
    failed = health_state.failures()
    body = {"status": "degraded" if failed else "ok", **health_state.snapshot()}
    if failed:
        body["errors"] = failed
    return JSONResponse(status_code=503 if failed else 200, content=body)


@app.get("/model")
def model_info():
    """Which scorer + embedder is live (handy to verify training artifacts were picked up)."""
    from app.services import scorer
    from app.core.embeddings import model_name
    m = scorer._load()
    return {"scorer": m.get("version"), "threshold": scorer.threshold(), "embedder": model_name(), "metrics": m.get("metrics", {})}


@app.get("/stats")
def stats():
    """Efficiency counters per run (retrieved, gatedOut, prefiltered, skippedByHash, scored, eligible, ms) + totals + cache hit rates."""
    from app.services import run_stats
    from app.services.side_cache import cache_stats
    return {**run_stats.snapshot(), "cache": cache_stats()}