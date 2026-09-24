import time
from groq import Groq, RateLimitError, APIStatusError
from app.core.config import GROQ_API_KEY

client = Groq(api_key=GROQ_API_KEY)

# Controlled-call settings
MIN_SECONDS_BETWEEN_CALLS = 1.5   # simple pacing — avoids bursts that trip the rate limit
MAX_RETRIES = 4
BASE_BACKOFF_SECONDS = 2          # doubles each retry: 2s, 4s, 8s, 16s

_last_call_time = 0.0


def _wait_for_pacing():
    global _last_call_time
    elapsed = time.time() - _last_call_time
    if elapsed < MIN_SECONDS_BETWEEN_CALLS:
        time.sleep(MIN_SECONDS_BETWEEN_CALLS - elapsed)
    _last_call_time = time.time()


def ask_llm(system_prompt: str, user_prompt: str, json_mode: bool = True) -> str:
    _wait_for_pacing()

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            response = client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                response_format={"type": "json_object"} if json_mode else None,
                temperature=0.2,
            )
            return response.choices[0].message.content

        except RateLimitError as e:
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