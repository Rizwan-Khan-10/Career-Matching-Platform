import logging
import os
import threading
from fastapi import FastAPI

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"), format="%(asctime)s %(levelname)s %(name)s: %(message)s")

app = FastAPI()


@app.get("/")
@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/model")
def model_info():
    """Which scorer + embedder is live (handy to verify training artifacts were picked up)."""
    from app.services import scorer
    from app.core.embeddings import model_name
    m = scorer._load()
    return {"scorer": m.get("version"), "threshold": scorer.threshold(), "embedder": model_name(), "metrics": m.get("metrics", {})}


def start_consumer():
    if os.getenv("ENABLE_MATCHING_CONSUMER", "true").lower() != "true":
        return
    try:
        from app.workers.stream_consumer import run
        run()
    except Exception as exc:
        print(f"Matching-agent consumer startup failed: {exc}")


threading.Thread(target=start_consumer, daemon=True).start()