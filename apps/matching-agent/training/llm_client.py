"""Groq client used ONLY by training/build_real_dataset.py (it parses raw resumes / JDs with the same prompts the
parser agents use). The matching agent never calls an LLM at run time (Spec 6.3), so this file lives in training/,
`groq` is in requirements-train.txt (not requirements.txt) and the API keys are read here, not in app/core/config.py.

SEVERAL KEYS (training only). Put them in one variable, in the order you want them used (top first):

    PowerShell:  $env:GROQ_API_KEYS="gsk_key1,gsk_key2,gsk_key3"
    bash:        export GROQ_API_KEYS=gsk_key1,gsk_key2,gsk_key3      (a single GROQ_API_KEY still works)

  * Keys are used ONE AFTER THE OTHER, top to bottom. A key keeps being used until it gets a rate-limit error (429)
    RATE_LIMITS_BEFORE_SWITCH times in a row; then it is parked and the NEXT key in the list takes over. After the
    last key the run goes back to the first one (if it has recovered by then). It never jumps back to the top
    just because an earlier key recovered.
  * A "per day" limit parks the key until the limit resets (no point retrying it for minutes).
  * An invalid / unpaid / forbidden key (401, 402, 403) is switched off for the rest of the run.
  * When EVERY key has failed (parked or switched off) the run stops cleanly (AllKeysExhausted). Nothing is lost: build_real_dataset.py caches every
    parsed document the moment it is parsed, so running the same command again continues where it stopped.
Keys are never printed: messages only say "key 2/3".
"""
import os
import re
import threading
import time

from training.groq_model import DEFAULT_MODEL

_state = {"model": DEFAULT_MODEL}

# gpt-oss models "think" before answering; for extraction "low" is enough and uses far fewer tokens (rate limit!). low | medium | high
REASONING_EFFORT = "low"

# Controlled-call settings
MIN_SECONDS_BETWEEN_CALLS = 1.5   # simple pacing: avoids bursts that trip the rate limit
MAX_RETRIES = 4                   # connection errors / 5xx / empty answers / json_validate_failed: 2s, 4s, 8s, then give up on this document
BASE_BACKOFF_SECONDS = 2

# Key rotation
RATE_LIMITS_BEFORE_SWITCH = 5     # consecutive 429s on one key before the next key is used
KEY_COOLDOWN_SECONDS = 65         # per-minute limit: a parked key can be used again after this long
DAILY_COOLDOWN_SECONDS = 24 * 3600  # used for a "per day" limit when the API does not say when it resets
MAX_WAIT_FOR_KEY_SECONDS = 30    # every key is parked but one is back within this many seconds: wait for it; otherwise stop (0 = stop at once)
DEAD_STATUS_CODES = (401, 402, 403)


class AllKeysExhausted(SystemExit):
    """Raised when no key can be used any more. A SystemExit on purpose: DiskCache's `except Exception` must not turn it
    into 'one bad document'; the run stops, and everything parsed so far is already in the cache."""


class _Key:
    def __init__(self, index: int, total: int, secret: str):
        self.index, self.total, self.secret = index, total, secret
        self.client = None
        self.streak = 0              # consecutive 429s
        self.blocked_until = 0.0
        self.dead = None             # reason text when the key is switched off for good

    @property
    def label(self) -> str:
        return f"key {self.index + 1}/{self.total}"


class KeyPool:
    def __init__(self, secrets):
        self.keys = [_Key(i, len(secrets), s) for i, s in enumerate(secrets)]
        self.current = None
        self.cursor = 0              # index of the key in use; the search for a usable key starts here and wraps round

    def pick(self, now):
        """The key in use if it is fine, else the next usable key after it (top -> bottom, then back to the top)."""
        n = len(self.keys)
        for step in range(n):
            k = self.keys[(self.cursor + step) % n]
            if k.dead is None and k.blocked_until <= now:
                self.cursor = k.index
                return k
        return None

    def soonest_free(self):
        times = [k.blocked_until for k in self.keys if k.dead is None]
        return min(times) if times else None

    def summary(self, now):
        parts = []
        for k in self.keys:
            if k.dead is not None:
                parts.append(f"{k.label}: switched off ({k.dead})")
            else:
                left = max(0, int(k.blocked_until - now))
                parts.append(f"{k.label}: limit reached, back in ~{_human(left)}")
        return "; ".join(parts)


_pool = None
_pool_lock = threading.Lock()
_last_call_time = 0.0
_pace_lock = threading.Lock()


def _human(seconds: int) -> str:
    if seconds >= 3600:
        return f"{seconds // 3600}h {seconds % 3600 // 60}m"
    if seconds >= 60:
        return f"{seconds // 60}m"
    return f"{seconds}s"


def set_model(name: str) -> None:
    """build_real_dataset.py --model <name> (default training.groq_model.DEFAULT_MODEL)."""
    _state["model"] = name


def get_model() -> str:
    return _state["model"]


def _read_keys():
    raw = ",".join(filter(None, [os.getenv("GROQ_API_KEYS"), os.getenv("GROQ_API_KEY")]))
    secrets = []
    for s in re.split(r"[,\s;]+", raw):
        s = s.strip().strip("\"'")
        if s and s not in secrets:
            secrets.append(s)
    return secrets


def _get_pool() -> KeyPool:
    """Created on first use so importing this module needs neither the keys nor the network."""
    global _pool
    with _pool_lock:
        if _pool is None:
            secrets = _read_keys()
            if not secrets:
                raise SystemExit("GROQ_API_KEYS (or GROQ_API_KEY) is not set (training only: set it in your shell before build_real_dataset)")
            _pool = KeyPool(secrets)
            print(f"Groq keys loaded: {len(secrets)}")
        return _pool


def _new_client(secret: str):
    from groq import Groq
    # max_retries=0: the SDK would silently retry 429s itself and hide them from the key rotation below
    return Groq(api_key=secret, max_retries=0)


def _client_for(key: _Key):
    if key.client is None:
        key.client = _new_client(key.secret)
    return key.client


def _wait_for_pacing():
    global _last_call_time
    with _pace_lock:
        elapsed = time.time() - _last_call_time
        if elapsed < MIN_SECONDS_BETWEEN_CALLS:
            time.sleep(MIN_SECONDS_BETWEEN_CALLS - elapsed)
        _last_call_time = time.time()


def _acquire(pool: KeyPool) -> _Key:
    """The key in use, or the next usable one (wrapping from the last key to the first). Waits a few seconds if every key
    is resting but one is about to be back; stops the run when every key has failed."""
    while True:
        now = time.time()
        key = pool.pick(now)
        if key is not None:
            if pool.current is not key:
                if pool.current is not None:
                    print(f"  using {key.label}")
                pool.current = key
            return key
        soonest = pool.soonest_free()
        if soonest is None or soonest - now > MAX_WAIT_FOR_KEY_SECONDS:
            raise AllKeysExhausted(
                "\nEvery Groq key has failed -> " + pool.summary(now) + "\n"
                "Everything parsed so far is saved in the cache. Run the same command again later "
                "(per-day limits reset within 24 hours), add more keys to GROQ_API_KEYS, or run with --cached-only "
                "to build the training file from what is already cached.\n")
        wait = max(0.0, soonest - now) + 0.5
        print(f"  all keys resting - waiting {_human(int(wait))} for the first one to recover")
        time.sleep(wait)


def _retry_after_seconds(exc):
    response = getattr(exc, "response", None)
    headers = getattr(response, "headers", None) or {}
    try:
        return float(headers.get("retry-after"))
    except (TypeError, ValueError, AttributeError):
        return None


def _on_rate_limit(key: _Key, exc) -> None:
    now = time.time()
    text = str(exc).lower()
    retry_after = _retry_after_seconds(exc)
    if "per day" in text or "(tpd)" in text or "(rpd)" in text:
        key.streak = 0
        key.blocked_until = now + (retry_after if retry_after else DAILY_COOLDOWN_SECONDS)
        print(f"  {key.label}: daily limit reached - parked for ~{_human(int(key.blocked_until - now))}")
        return
    key.streak += 1
    if key.streak >= RATE_LIMITS_BEFORE_SWITCH:
        key.streak = 0
        key.blocked_until = now + max(KEY_COOLDOWN_SECONDS, retry_after or 0)
        print(f"  {key.label}: rate limited {RATE_LIMITS_BEFORE_SWITCH} times in a row - parked, trying the next key")
        return
    wait = min(retry_after if retry_after else BASE_BACKOFF_SECONDS * 2 ** (key.streak - 1), 30)
    print(f"  {key.label}: rate limited ({key.streak}/{RATE_LIMITS_BEFORE_SWITCH}) - waiting {_human(int(wait))}")
    time.sleep(wait)


def ask_llm(system_prompt: str, user_prompt: str, json_mode: bool = True, temperature: float = 0.0) -> str:
    """temperature defaults to 0: extraction must be repeatable (same file -> same parse)."""
    from groq import RateLimitError, APIStatusError, APIConnectionError, APITimeoutError
    model = get_model()
    pool = _get_pool()
    transient = 0                                                   # failures that are not about the key
    rate_limit_budget = RATE_LIMITS_BEFORE_SWITCH * len(pool.keys) * 2   # safety: one document cannot loop for ever
    rate_limited = 0

    def backoff(why: str):
        nonlocal transient
        transient += 1
        if transient >= MAX_RETRIES:
            return False
        wait = BASE_BACKOFF_SECONDS * (2 ** (transient - 1))
        print(f"{why} (attempt {transient}/{MAX_RETRIES}) - waiting {wait}s before retry")
        time.sleep(wait)
        return True

    while True:
        key = _acquire(pool)
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
            content = _client_for(key).chat.completions.create(**kwargs).choices[0].message.content
            if not content or not content.strip():
                raise RuntimeError(f"{model} returned an empty answer")   # reasoning models can run out of tokens while thinking
            key.streak = 0
            return content
        except RateLimitError as e:
            rate_limited += 1
            if rate_limited > rate_limit_budget:
                raise
            _on_rate_limit(key, e)
        except (APIConnectionError, APITimeoutError) as e:
            if not backoff(f"Groq {type(e).__name__}"):
                raise
        except APIStatusError as e:
            code = getattr(e, "status_code", 0)
            if code in DEAD_STATUS_CODES:
                key.dead = f"HTTP {code}, key invalid / not allowed / billing problem"
                print(f"  {key.label}: {key.dead} - switched off")
            elif code >= 500 or "json_validate_failed" in str(e):
                # 5xx = transient; json_validate_failed = the model produced broken JSON this time, an identical retry often works
                if not backoff(f"Groq error {code}"):
                    raise
            else:
                raise   # 404 model gone, other bad requests: fail fast
        except RuntimeError:
            if not backoff("empty LLM answer"):
                raise
