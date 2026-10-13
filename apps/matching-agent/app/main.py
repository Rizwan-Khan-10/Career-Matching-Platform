import logging
import os
import threading
from fastapi import FastAPI
from fastapi.responses import JSONResponse

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"), format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("matching.main")

app = FastAPI()

# "disabled" (ENABLE_MATCHING_CONSUMER=false) | "starting" | "failed"
_state = {"consumer": "starting", "error": None}


@app.get("/")
@app.get("/health")
def health():
    """503 when the Redis consumer crashed on startup, so Docker/uptime checks notice instead of a fake 'ok'."""
    failed = _state["consumer"] == "failed"
    return JSONResponse(status_code=503 if failed else 200,
                        content={"status": "degraded" if failed else "ok", "consumer": _state["consumer"], "error": _state["error"]})


@app.get("/model")
def model_info():
    """Which scorer + embedder is live (handy to verify training artifacts were picked up)."""
    from app.services import scorer
    from app.core.embeddings import model_name
    m = scorer._load()
    return {"scorer": m.get("version"), "threshold": scorer.threshold(), "embedder": model_name(), "metrics": m.get("metrics", {})}


def start_consumer():
    if os.getenv("ENABLE_MATCHING_CONSUMER", "true").lower() != "true":
        _state["consumer"] = "disabled"
        return
    try:
        from app.workers.stream_consumer import run
        run()
    except Exception as exc:
        _state.update(consumer="failed", error=str(exc)[:300])
        log.exception("Matching-agent consumer startup failed")


threading.Thread(target=start_consumer, daemon=True).start()