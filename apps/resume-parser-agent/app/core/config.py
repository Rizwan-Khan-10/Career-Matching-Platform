import os
from dotenv import load_dotenv

load_dotenv()


def _flag(name: str, default: str) -> bool:
    return os.getenv(name, default).strip().lower() == "true"


SERVICE_NAME = "resume-parser-agent"
DATABASE_URL = os.getenv("DATABASE_URL")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
PORT = int(os.getenv("PORT", 8001))
TESSERACT_PATH = os.getenv("TESSERACT_PATH", r"D:\Program Files\Tesseract-OCR\tesseract.exe")
# --- resume -> PDF delivery (same Cloudinary account resume-service uploads to) ---
CLOUDINARY_CLOUD_NAME = os.getenv("CLOUDINARY_CLOUD_NAME")
CLOUDINARY_API_KEY = os.getenv("CLOUDINARY_API_KEY")
CLOUDINARY_API_SECRET = os.getenv("CLOUDINARY_API_SECRET")
# --- ops ---
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
ENABLE_DOCS = _flag("ENABLE_DOCS", "false")
ENABLE_RESUME_PARSER_CONSUMER = _flag("ENABLE_RESUME_PARSER_CONSUMER", "true")
ENABLE_RESUME_PDF_CONSUMER = _flag("ENABLE_RESUME_PDF_CONSUMER", "true")