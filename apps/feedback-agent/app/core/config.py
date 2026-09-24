import os
from dotenv import load_dotenv

load_dotenv()  # reads .env in the project root

DATABASE_URL = os.getenv("DATABASE_URL")
REDIS_URL = os.getenv("REDIS_URL") or os.getenv("REDIS_REDIS_URL") or "redis://localhost:6379"
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
PORT = int(os.getenv("PORT", 8000))
