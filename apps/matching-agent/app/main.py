import os
import threading
from fastapi import FastAPI

app = FastAPI()


@app.get("/")
@app.get("/health")
def health():
    return {"status": "ok"}


def start_consumer():
    if os.getenv("ENABLE_MATCHING_CONSUMER", "true").lower() != "true":
        return
    try:
        from app.workers.stream_consumer import run
        run()
    except Exception as exc:
        print(f"Matching-agent consumer startup failed: {exc}")


threading.Thread(target=start_consumer, daemon=True).start()