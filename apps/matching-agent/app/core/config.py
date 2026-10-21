import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
PORT = int(os.getenv("PORT", 8000))

# --- ops (contract §3) --------------------------------------------------------
def _flag(name: str, default: str) -> bool:
    return os.getenv(name, default).strip().lower() == "true"


SERVICE_NAME = "matching-agent"
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
ENABLE_DOCS = _flag("ENABLE_DOCS", "false")                         # FastAPI /docs only when true
ENABLE_MATCHING_CONSUMER = _flag("ENABLE_MATCHING_CONSUMER", "true")
INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY")

# --- embeddings -------------------------------------------------------------
# "minilm" = real semantic model (production). "hash" = tiny offline fallback used ONLY for
# unit tests / CI where the model can't be downloaded. The agent refuses to start with "hash" when
# APP_ENV (or ENV) is "production".
IS_PRODUCTION = (os.getenv("APP_ENV") or os.getenv("ENV") or "").strip().lower() == "production"
EMBEDDING_BACKEND = os.getenv("EMBEDDING_BACKEND", "minilm")
EMBEDDING_MODEL_NAME = os.getenv("EMBEDDING_MODEL_NAME", "all-MiniLM-L6-v2")

# --- retrieval --------------------------------------------------------------
TOP_K_ROLES_PER_RESUME = int(os.getenv("TOP_K_ROLES_PER_RESUME", 50))
TOP_K_RESUMES_PER_ROLE = int(os.getenv("TOP_K_RESUMES_PER_ROLE", 100))

# --- efficient matching (contract §8) -----------------------------------------
BATCH_SIZE = int(os.getenv("BATCH_SIZE", 25))                                  # candidates scored per batch, best similarity first
EARLY_STOP_EMPTY_BATCHES = int(os.getenv("EARLY_STOP_EMPTY_BATCHES", 2))       # stop after N consecutive batches with no eligible pair
MAX_ELIGIBLE_PER_ROLE = int(os.getenv("MAX_ELIGIBLE_PER_ROLE", 200))           # stop once this many eligible pairs were found in a run
SIDE_CACHE_SIZE = int(os.getenv("SIDE_CACHE_SIZE", 2000))                      # in-process LRU entries, per side (resume / role)
# Cheap prefilter: skip a pair only when NO required skill matches exactly AND profile cosine < this value.
# OFF unless set. Enable only after the gold set shows recall drops by <= 1 point (see README).
_p = os.getenv("PREFILTER_MIN_COSINE")
PREFILTER_MIN_COSINE = float(_p) if _p else None

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

# --- verdict: eligible / review / not_eligible ---------------------------------
# review = a "possible match": score in [threshold - REVIEW_BAND_WIDTH, threshold) and no hard gate failed.
# REVIEW_BAND_WIDTH=0 switches the review band off (only eligible / not_eligible, as before).
REVIEW_BAND_WIDTH = float(os.getenv("REVIEW_BAND_WIDTH", 0.10))
# separate bar for fresher / any roles (they never get the experience-surplus boost). Empty = same as ELIGIBILITY_THRESHOLD.
_ft = os.getenv("FRESHER_ELIGIBILITY_THRESHOLD")
FRESHER_ELIGIBILITY_THRESHOLD = float(_ft) if _ft else None
# how many "review" pairs are published per run (eligible pairs are never capped here)
MAX_REVIEW_PER_RESUME = int(os.getenv("MAX_REVIEW_PER_RESUME", 20))
MAX_REVIEW_PER_ROLE = int(os.getenv("MAX_REVIEW_PER_ROLE", 20))
# "overqualified" note for recruiters: only when the company set NO max experience, the role has a minimum, and the
# candidate has more than minimum + this many years. It never changes the verdict or the score.
OVERQUALIFIED_EXTRA_YEARS = float(os.getenv("OVERQUALIFIED_EXTRA_YEARS", 5))

# --- role level (fresher / any roles) ----------------------------------------
# INTERIM nudges (logit units) for projects / internship on fresher + any roles. They are used ONLY while the
# loaded scorer.json was trained without the fresher features; a scorer trained with them (task 2.10) uses its own
# weights. Set both to 0 to switch the nudge off.
FRESHER_PROJECT_WEIGHT = float(os.getenv("FRESHER_PROJECT_WEIGHT", 0.6))
FRESHER_INTERNSHIP_WEIGHT = float(os.getenv("FRESHER_INTERNSHIP_WEIGHT", 0.3))

# Optional override of the probability threshold stored in the trained scorer (None = use trained one)
_t = os.getenv("ELIGIBILITY_THRESHOLD")
ELIGIBILITY_THRESHOLD = float(_t) if _t else None

SCORER_PATH = os.getenv("SCORER_PATH", os.path.join(os.path.dirname(os.path.dirname(__file__)), "artifacts", "scorer.json"))