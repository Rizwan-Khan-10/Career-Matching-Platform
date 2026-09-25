import time
from groq import Groq, RateLimitError, APIStatusError
from app.core.config import GROQ_API_KEY

client = Groq(api_key=GROQ_API_KEY)

MIN_SECONDS_BETWEEN_CALLS = 1.5
MAX_RETRIES = 4
BASE_BACKOFF_SECONDS = 2

_last_call_time = 0.0


def _wait_for_pacing():
    global _last_call_time
    elapsed = time.time() - _last_call_time
    if elapsed < MIN_SECONDS_BETWEEN_CALLS:
        time.sleep(MIN_SECONDS_BETWEEN_CALLS - elapsed)
    _last_call_time = time.time()


def call_chat_completion(messages: list[dict], model: str = "openai/gpt-oss-120b", temperature: float = 0.4):
    _wait_for_pacing()

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            return client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=temperature,
            )
        except RateLimitError:
            if attempt == MAX_RETRIES:
                raise
            wait = BASE_BACKOFF_SECONDS * (2 ** (attempt - 1))
            print(f"Groq rate limit hit (attempt {attempt}/{MAX_RETRIES}) — waiting {wait}s before retry")
            time.sleep(wait)
        except APIStatusError as e:
            if e.status_code >= 500 and attempt < MAX_RETRIES:
                wait = BASE_BACKOFF_SECONDS * (2 ** (attempt - 1))
                print(f"Groq server error {e.status_code} (attempt {attempt}/{MAX_RETRIES}) — waiting {wait}s before retry")
                time.sleep(wait)
            else:
                raise