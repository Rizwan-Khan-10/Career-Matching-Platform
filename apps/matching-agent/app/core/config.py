import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
PORT = int(os.getenv("PORT", 8000))

# --- embeddings -------------------------------------------------------------
# "minilm" = real semantic model (production). "hash" = tiny offline fallback used ONLY for
# unit tests / CI where the model can't be downloaded. Never use "hash" in production.
EMBEDDING_BACKEND = os.getenv("EMBEDDING_BACKEND", "minilm")
EMBEDDING_MODEL_NAME = os.getenv("EMBEDDING_MODEL_NAME", "all-MiniLM-L6-v2")

# --- retrieval --------------------------------------------------------------
TOP_K_ROLES_PER_RESUME = int(os.getenv("TOP_K_ROLES_PER_RESUME", 50))
TOP_K_RESUMES_PER_ROLE = int(os.getenv("TOP_K_RESUMES_PER_ROLE", 100))

# --- what we publish --------------------------------------------------------
# Every eligible pair is always published. Ineligible pairs are noise unless they are "near misses",
# so only the best few (and only above MIN_PUBLISH_SCORE) are published for feedback/UX.
MAX_INELIGIBLE_PER_RESUME = int(os.getenv("MAX_INELIGIBLE_PER_RESUME", 5))
MAX_INELIGIBLE_PER_ROLE = int(os.getenv("MAX_INELIGIBLE_PER_ROLE", 5))
MIN_PUBLISH_SCORE = float(os.getenv("MIN_PUBLISH_SCORE", 0.20))

# --- eligibility gates (hard rules on top of the model probability) ----------
MIN_REQUIRED_SKILL_COVERAGE = float(os.getenv("MIN_REQUIRED_SKILL_COVERAGE", 0.35))
EXPERIENCE_GATE_RATIO = float(os.getenv("EXPERIENCE_GATE_RATIO", 0.5))   # exp < ratio * min_exp ...
EXPERIENCE_GATE_MIN_GAP_YEARS = float(os.getenv("EXPERIENCE_GATE_MIN_GAP_YEARS", 1.0))  # ... and gap >= 1 yr

# Optional override of the probability threshold stored in the trained scorer (None = use trained one)
_t = os.getenv("ELIGIBILITY_THRESHOLD")
ELIGIBILITY_THRESHOLD = float(_t) if _t else None

SCORER_PATH = os.getenv("SCORER_PATH", os.path.join(os.path.dirname(os.path.dirname(__file__)), "artifacts", "scorer.json"))