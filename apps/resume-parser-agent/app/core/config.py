import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
PORT = int(os.getenv("PORT", 8000))
TESSERACT_PATH = os.getenv("TESSERACT_PATH", r"D:\Program Files\Tesseract-OCR\tesseract.exe")
# --- resume -> PDF delivery (same Cloudinary account resume-service uploads to) ---
CLOUDINARY_CLOUD_NAME = os.getenv("CLOUDINARY_CLOUD_NAME")
CLOUDINARY_API_KEY = os.getenv("CLOUDINARY_API_KEY")
CLOUDINARY_API_SECRET = os.getenv("CLOUDINARY_API_SECRET")