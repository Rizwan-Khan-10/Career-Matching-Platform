import os
import logging
import threading
import time
from groq import Groq, RateLimitError, APIStatusError, APIConnectionError, APITimeoutError
from app.core.config import GROQ_API_KEY

log = logging.getLogger("resume.llm")
client = Groq(api_key=GROQ_API_KEY)

# llama-3.3-70b-versatile was shut down by Groq on 2026-08-16 (404 "model does not exist"). Override with GROQ_MODEL in .env.
MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")
# gpt-oss models "think" before answering; for extraction "low" is enough and uses far fewer tokens (rate limit!). low | medium | high
REASONING_EFFORT = os.getenv("GROQ_REASONING_EFFORT", "low")

# Controlled-call settings
MIN_SECONDS_BETWEEN_CALLS = 1.5   # simple pacing: avoids bursts that trip the rate limit
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
        if MODEL.startswith("openai/gpt-oss"):
            kwargs["extra_body"] = {"reasoning_effort": REASONING_EFFORT}   # extra_body works with every groq SDK version
        try:
            content = client.chat.completions.create(**kwargs).choices[0].message.content
            if not content or not content.strip():
                raise RuntimeError(f"{MODEL} returned an empty answer")   # reasoning models can run out of tokens while thinking
            return content
        except (RateLimitError, APIConnectionError, APITimeoutError) as e:
            if attempt == MAX_RETRIES:
                raise
            wait = BASE_BACKOFF_SECONDS * (2 ** (attempt - 1))
            log.warning("Groq %s (attempt %s/%s) - waiting %ss before retry", type(e).__name__, attempt, MAX_RETRIES, wait)
            time.sleep(wait)
        except APIStatusError as e:
            # 5xx = transient -> retry; anything else (404 model gone, bad request, auth) -> fail fast
            if e.status_code >= 500 and attempt < MAX_RETRIES:
                wait = BASE_BACKOFF_SECONDS * (2 ** (attempt - 1))
                log.warning("Groq server error %s (attempt %s/%s) - waiting %ss before retry", e.status_code, attempt, MAX_RETRIES, wait)
                time.sleep(wait)
            else:
                raise
        except RuntimeError:
            if attempt == MAX_RETRIES:
                raise
            log.warning("empty LLM answer (attempt %s/%s) - retrying", attempt, MAX_RETRIES)