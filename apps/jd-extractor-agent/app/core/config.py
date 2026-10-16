import os
from dotenv import load_dotenv

load_dotenv()


def _flag(name: str, default: str) -> bool:
    return os.getenv(name, default).strip().lower() == "true"


SERVICE_NAME = "jd-extractor-agent"
DATABASE_URL = os.getenv("DATABASE_URL")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
PORT = int(os.getenv("PORT", 8002))
TESSERACT_PATH = os.getenv("TESSERACT_PATH", r"D:\Program Files\Tesseract-OCR\tesseract.exe")
# --- ops ---
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
ENABLE_DOCS = _flag("ENABLE_DOCS", "false")
ENABLE_JD_EXTRACTOR_CONSUMER = _flag("ENABLE_JD_EXTRACTOR_CONSUMER", "true")