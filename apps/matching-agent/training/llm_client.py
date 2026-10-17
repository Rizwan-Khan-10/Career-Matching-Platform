"""Groq client used ONLY by training/build_real_dataset.py (it parses raw resumes / JDs with the same prompts the
parser agents use). The matching agent never calls an LLM at run time (Spec 6.3), so this file lives in training/,
`groq` is in requirements-train.txt (not requirements.txt) and the API key is read here, not in app/core/config.py.
"""
import os
import threading
import time

from training.groq_model import DEFAULT_MODEL

_state = {"client": None, "model": DEFAULT_MODEL}

# gpt-oss models "think" before answering; for extraction "low" is enough and uses far fewer tokens (rate limit!). low | medium | high
REASONING_EFFORT = "low"

# Controlled-call settings
MIN_SECONDS_BETWEEN_CALLS = 1.5   # simple pacing: avoids bursts that trip the rate limit
MAX_RETRIES = 4
BASE_BACKOFF_SECONDS = 2          # doubles each retry: 2s, 4s, 8s, 16s

_last_call_time = 0.0
_pace_lock = threading.Lock()


def set_model(name: str) -> None:
    """build_real_dataset.py --model <name> (default training.groq_model.DEFAULT_MODEL)."""
    _state["model"] = name


def get_model() -> str:
    return _state["model"]


def _client():
    """Created on first use so importing this module needs neither the key nor the network."""
    if _state["client"] is None:
        key = os.getenv("GROQ_API_KEY")
        if not key:
            raise SystemExit("GROQ_API_KEY is not set (training only: export it in your shell before build_real_dataset)")
        from groq import Groq
        _state["client"] = Groq(api_key=key)
    return _state["client"]


def _wait_for_pacing():
    global _last_call_time
    with _pace_lock:
        elapsed = time.time() - _last_call_time
        if elapsed < MIN_SECONDS_BETWEEN_CALLS:
            time.sleep(MIN_SECONDS_BETWEEN_CALLS - elapsed)
        _last_call_time = time.time()


def ask_llm(system_prompt: str, user_prompt: str, json_mode: bool = True, temperature: float = 0.0) -> str:
    """temperature defaults to 0: extraction must be repeatable (same file -> same parse)."""
    from groq import RateLimitError, APIStatusError, APIConnectionError, APITimeoutError
    model = get_model()
    for attempt in range(1, MAX_RETRIES + 1):
        _wait_for_pacing()
        kwargs = dict(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=temperature,
        )
        if json_mode:
            kwargs["response_format"] = {"type": "json_object"}   # only send the key when needed (None is not "unset")
        if model.startswith("openai/gpt-oss"):
            kwargs["extra_body"] = {"reasoning_effort": REASONING_EFFORT}   # extra_body works with every groq SDK version
        try:
            content = _client().chat.completions.create(**kwargs).choices[0].message.content
            if not content or not content.strip():
                raise RuntimeError(f"{model} returned an empty answer")   # reasoning models can run out of tokens while thinking
            return content
        except (RateLimitError, APIConnectionError, APITimeoutError) as e:
            if attempt == MAX_RETRIES:
                raise
            wait = BASE_BACKOFF_SECONDS * (2 ** (attempt - 1))
            print(f"Groq {type(e).__name__} (attempt {attempt}/{MAX_RETRIES}) - waiting {wait}s before retry")
            time.sleep(wait)
        except APIStatusError as e:
            # 5xx = transient -> retry; anything else (404 model gone, bad request, auth) -> fail fast
            if e.status_code >= 500 and attempt < MAX_RETRIES:
                wait = BASE_BACKOFF_SECONDS * (2 ** (attempt - 1))
                print(f"Groq server error {e.status_code} (attempt {attempt}/{MAX_RETRIES}) - waiting {wait}s before retry")
                time.sleep(wait)
            else:
                raise
        except RuntimeError:
            if attempt == MAX_RETRIES:
                raise
            print(f"empty LLM answer (attempt {attempt}/{MAX_RETRIES}) - retrying")