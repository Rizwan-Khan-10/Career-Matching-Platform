import os
from dotenv import load_dotenv

load_dotenv()  # reads .env in the project root


def _flag(name: str, default: str) -> bool:
    return os.getenv(name, default).strip().lower() == "true"


DATABASE_URL = os.getenv("DATABASE_URL")
REDIS_URL = os.getenv("REDIS_URL") or "redis://localhost:6379"
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
PORT = int(os.getenv("PORT", 8000))

# --- ops (contract section 3) --------------------------------------------------
SERVICE_NAME = "feedback-agent"
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
ENABLE_DOCS = _flag("ENABLE_DOCS", "false")                          # FastAPI /docs only when true
ENABLE_FEEDBACK_CONSUMER = _flag("ENABLE_FEEDBACK_CONSUMER", "true")
