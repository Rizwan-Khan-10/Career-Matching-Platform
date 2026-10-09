import os
import threading
import time
from groq import Groq, RateLimitError, APIStatusError, APIConnectionError, APITimeoutError
from app.core.config import GROQ_API_KEY

client = Groq(api_key=GROQ_API_KEY)
MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")

# Controlled-call settings
MIN_SECONDS_BETWEEN_CALLS = 1.5   # simple pacing — avoids bursts that trip the rate limit
MAX_RETRIES = 4
BASE_BACKOFF_SECONDS = 2          # doubles each retry: 2s, 4s, 8s, 16s

_last_call_time = 0.0
_pace_lock = threading.Lock()     # several consumer threads may share this process


def _wait_for_pacing():
    global _last_call_time
    with _pace_lock:
        elapsed = time.time() - _last_call_time
        if elapsed < MIN_SECONDS_BETWEEN_CALLS:
            time.sleep(MIN_SECONDS_BETWEEN_CALLS - elapsed)
        _last_call_time = time.time()


def ask_llm(system_prompt: str, user_prompt: str, json_mode: bool = True, temperature: float = 0.0) -> str:
    """temperature defaults to 0: extraction must be repeatable (same file -> same parse)."""
    for attempt in range(1, MAX_RETRIES + 1):
        _wait_for_pacing()
        kwargs = dict(
            model=MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=temperature,
        )
        if json_mode:
            kwargs["response_format"] = {"type": "json_object"}   # only send the key when needed (None is not "unset")
        try:
            return client.chat.completions.create(**kwargs).choices[0].message.content
        except (RateLimitError, APIConnectionError, APITimeoutError) as e:
            if attempt == MAX_RETRIES:
                raise
            wait = BASE_BACKOFF_SECONDS * (2 ** (attempt - 1))
            print(f"Groq {type(e).__name__} (attempt {attempt}/{MAX_RETRIES}) — waiting {wait}s before retry")
            time.sleep(wait)
        except APIStatusError as e:
            # 5xx = transient -> retry; anything else (bad request, auth) -> fail fast
            if e.status_code >= 500 and attempt < MAX_RETRIES:
                wait = BASE_BACKOFF_SECONDS * (2 ** (attempt - 1))
                print(f"Groq server error {e.status_code} (attempt {attempt}/{MAX_RETRIES}) — waiting {wait}s before retry")
                time.sleep(wait)
            else:
                raise