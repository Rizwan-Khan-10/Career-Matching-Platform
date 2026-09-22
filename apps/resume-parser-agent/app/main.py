import threading
from fastapi import FastAPI

app = FastAPI()

@app.get("/health")
def health():
    return {"status": "ok"}

def start_consumer():
    from app.workers.stream_consumer import run
    run()

threading.Thread(target=start_consumer, daemon=True).start()