"""Key rotation in training/llm_client.py, with a fake `groq` package, a fake clock and no network.
Run:  python -m unittest training.test_llm_client -v
"""
import contextlib
import io
import json
import os
import sys
import tempfile
import types
import unittest
from types import SimpleNamespace

from training import llm_client as lc


class _APIStatusError(Exception):
    def __init__(self, message, status_code=400, headers=None):
        super().__init__(message)
        self.status_code = status_code
        self.response = SimpleNamespace(headers=headers or {})


class _RateLimitError(_APIStatusError):
    def __init__(self, message="Rate limit reached for model: tokens per minute (TPM)", headers=None):
        super().__init__(message, 429, headers)


class _APIConnectionError(Exception):
    pass


class _APITimeoutError(_APIConnectionError):
    pass


class _Clock:
    """time.time() / time.sleep() that never really sleep."""
    def __init__(self):
        self.now = 1_000_000.0
        self.slept = []

    def time(self):
        return self.now

    def sleep(self, seconds):
        self.slept.append(seconds)
        self.now += seconds


def _answer(text):
    return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=text))])


class _FakeClient:
    """script = list of items: an Exception is raised, a string is returned as the model answer; the last item repeats."""
    def __init__(self, script, log, name):
        self.script, self.log, self.name, self.i = script, log, name, 0
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self._create))

    def _create(self, **kwargs):
        self.log.append(self.name)
        item = self.script[min(self.i, len(self.script) - 1)]
        self.i += 1
        if isinstance(item, Exception):
            raise item
        return _answer(item)


class RotationTest(unittest.TestCase):
    def setUp(self):
        fake_groq = types.ModuleType("groq")
        fake_groq.RateLimitError, fake_groq.APIStatusError = _RateLimitError, _APIStatusError
        fake_groq.APIConnectionError, fake_groq.APITimeoutError = _APIConnectionError, _APITimeoutError
        saved = {k: getattr(lc, k) for k in ("time", "_pool", "_new_client", "_last_call_time")}
        saved_mod = sys.modules.get("groq")
        sys.modules["groq"] = fake_groq
        self.clock, self.log = _Clock(), []
        lc.time = self.clock
        lc._pool, lc._last_call_time = None, 0.0
        self.scripts = {}
        lc._new_client = lambda secret: _FakeClient(self.scripts[secret], self.log, secret)
        self.env = {k: os.environ.pop(k, None) for k in ("GROQ_API_KEYS", "GROQ_API_KEY")}

        def restore():
            for k, v in saved.items():
                setattr(lc, k, v)
            if saved_mod is None:
                sys.modules.pop("groq", None)
            else:
                sys.modules["groq"] = saved_mod
            for k, v in self.env.items():
                os.environ.pop(k, None)
                if v is not None:
                    os.environ[k] = v
        self.addCleanup(restore)

    def keys(self, **scripts):
        self.scripts = scripts
        os.environ["GROQ_API_KEYS"] = ",".join(scripts)

    def ask(self):
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            try:
                return lc.ask_llm("s", "u"), buf.getvalue()
            except BaseException as exc:                       # noqa: BLE001 - tests inspect SystemExit too
                self.out = buf.getvalue()
                raise exc

    def test_single_key_works(self):
        self.keys(k1=['{"ok":1}'])
        self.assertEqual(self.ask()[0], '{"ok":1}')

    def test_five_rate_limits_switch_to_the_next_key(self):
        self.keys(k1=[_RateLimitError()], k2=['{"ok":2}'])
        text, out = self.ask()
        self.assertEqual(text, '{"ok":2}')
        self.assertEqual(self.log, ["k1"] * 5 + ["k2"])
        self.assertIn("parked", out)

    def test_less_than_five_rate_limits_stay_on_the_same_key(self):
        self.keys(k1=[_RateLimitError(), _RateLimitError(), '{"ok":1}'], k2=['{"ok":2}'])
        self.assertEqual(self.ask()[0], '{"ok":1}')
        self.assertEqual(self.log, ["k1", "k1", "k1"])

    def test_daily_limit_switches_at_once_without_waiting(self):
        self.keys(k1=[_RateLimitError("Rate limit reached: tokens per day (TPD): Limit 200000")], k2=['{"ok":2}'])
        self.assertEqual(self.ask()[0], '{"ok":2}')
        self.assertEqual(self.log, ["k1", "k2"])
        self.assertEqual(sum(self.clock.slept) < 5, True)        # only the pacing, no back-off sleeps

    def test_stays_on_the_key_in_use_after_an_earlier_key_recovers(self):
        self.keys(k1=[_RateLimitError()] * 5 + ['{"ok":1}'], k2=['{"ok":2}'])
        self.ask()                                               # k1 parked, k2 took over
        self.clock.now += lc.KEY_COOLDOWN_SECONDS + 1            # k1 is usable again ...
        self.log.clear()
        self.assertEqual(self.ask()[0], '{"ok":2}')              # ... but the run does NOT jump back to the top
        self.assertEqual(self.log, ["k2"])

    def test_goes_top_to_bottom_then_wraps_to_the_first_key(self):
        failing = [_RateLimitError()] * 5
        self.keys(k1=failing + ['{"ok":1}'], k2=[_RateLimitError()], k3=[_RateLimitError()])
        text, _ = self.ask()
        self.assertEqual(text, '{"ok":1}')                       # k1 had recovered by the time k3 gave up
        self.assertEqual(self.log, ["k1"] * 5 + ["k2"] * 5 + ["k3"] * 5 + ["k1"])

    def test_every_key_failed_stops(self):
        self.keys(k1=[_RateLimitError()], k2=[_RateLimitError()])    # per-minute limits that do not clear
        with self.assertRaises(lc.AllKeysExhausted) as ctx:
            self.ask()
        self.assertIn("Every Groq key has failed", str(ctx.exception))
        self.assertEqual(self.log, ["k1"] * 5 + ["k2"] * 5)       # each key was tried 5 times, then the run stopped

    def test_parked_key_is_skipped_until_it_recovers(self):
        self.keys(k1=[_RateLimitError()], k2=['{"ok":2}'])
        self.ask()
        self.log.clear()
        self.ask()
        self.assertEqual(self.log, ["k2"])                       # k1 still resting

    def test_invalid_key_is_switched_off(self):
        self.keys(k1=[_APIStatusError("invalid api key", 401)], k2=['{"ok":2}'])
        self.assertEqual(self.ask()[0], '{"ok":2}')
        self.log.clear()
        self.ask()
        self.assertEqual(self.log, ["k2"])

    def test_billing_error_switches_off_and_all_dead_stops_cleanly(self):
        self.keys(k1=[_APIStatusError("payment required", 402)], k2=[_APIStatusError("forbidden", 403)])
        with self.assertRaises(lc.AllKeysExhausted) as ctx:
            self.ask()
        self.assertIsInstance(ctx.exception, SystemExit)
        self.assertNotIsInstance(ctx.exception, Exception)       # DiskCache's `except Exception` must not swallow it
        self.assertIn("cache", str(ctx.exception))

    def test_all_keys_daily_limited_stops_with_a_clear_message(self):
        day = _RateLimitError("tokens per day (TPD) reached")
        self.keys(k1=[day], k2=[day])
        with self.assertRaises(lc.AllKeysExhausted) as ctx:
            self.ask()
        self.assertIn("--cached-only", str(ctx.exception))

    def test_short_wait_when_the_only_key_is_about_to_recover(self):
        self.addCleanup(setattr, lc, "MAX_WAIT_FOR_KEY_SECONDS", lc.MAX_WAIT_FOR_KEY_SECONDS)
        lc.MAX_WAIT_FOR_KEY_SECONDS = 120                        # the default grace is 30 s; widen it for this case
        self.keys(k1=[_RateLimitError()] * 5 + ['{"ok":1}'])
        text, out = self.ask()
        self.assertEqual(text, '{"ok":1}')
        self.assertIn("waiting", out)

    def test_single_key_that_keeps_failing_stops_with_the_default_grace(self):
        self.keys(k1=[_RateLimitError()])
        with self.assertRaises(lc.AllKeysExhausted):
            self.ask()

    def test_json_validate_failed_is_retried(self):
        bad = _APIStatusError("Error code: 400 - json_validate_failed", 400)
        self.keys(k1=[bad, '{"ok":1}'])
        self.assertEqual(self.ask()[0], '{"ok":1}')

    def test_other_400_fails_fast(self):
        self.keys(k1=[_APIStatusError("model not found", 404)])
        with self.assertRaises(_APIStatusError):
            self.ask()
        self.assertEqual(self.log, ["k1"])

    def test_server_errors_give_up_after_max_retries(self):
        self.keys(k1=[_APIStatusError("bad gateway", 502)])
        with self.assertRaises(_APIStatusError):
            self.ask()
        self.assertEqual(len(self.log), lc.MAX_RETRIES)

    def test_keys_are_never_printed(self):
        self.keys(secret_key_one=[_RateLimitError("tokens per day (TPD) reached")], secret_key_two=[_APIStatusError("x", 401)])
        with self.assertRaises(lc.AllKeysExhausted) as ctx:
            self.ask()
        everything = self.out + str(ctx.exception)
        self.assertNotIn("secret_key", everything)
        self.assertIn("key 1/2", everything)

    def test_missing_keys_message(self):
        with self.assertRaises(SystemExit) as ctx:
            lc.ask_llm("s", "u")
        self.assertIn("GROQ_API_KEYS", str(ctx.exception))

    def test_duplicates_and_quotes_in_the_list_are_cleaned(self):
        os.environ["GROQ_API_KEYS"] = ' "a" , b ;a\n c '
        self.assertEqual(lc._read_keys(), ["a", "b", "c"])


class CachedOnlyTest(unittest.TestCase):
    def test_cached_only_never_computes_and_never_writes(self):
        from training.build_real_dataset import DiskCache
        path = os.path.join(tempfile.mkdtemp(), "c.jsonl")
        with open(path, "w", encoding="utf-8") as f:
            f.write(json.dumps(["have", {"skills": ["Python"]}]) + "\n")
        cache = DiskCache(path)
        DiskCache.cached_only = True
        self.addCleanup(lambda: setattr(DiskCache, "cached_only", False))
        calls = []
        self.assertEqual(cache.get_or_compute("have", lambda: calls.append(1)), {"skills": ["Python"]})
        self.assertIsNone(cache.get_or_compute("missing", lambda: calls.append(1)))
        self.assertEqual(calls, [])
        self.assertEqual(len(open(path, encoding="utf-8").read().splitlines()), 1)   # nothing was cached as "empty"


if __name__ == "__main__":
    unittest.main()
