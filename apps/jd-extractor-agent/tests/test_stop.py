"""Stopped-job handling in the JD extractor with DB / Redis / LLM faked."""
import os
import types
import unittest

os.environ.setdefault("GROQ_API_KEY", "x")
from tests import _shims  # noqa: E402
_shims.install()

import sys  # noqa: E402
if "groq" not in sys.modules:   # llm_client imports groq at module level
    g = types.ModuleType("groq")
    for n in ("Groq", "RateLimitError", "APIStatusError", "APIConnectionError", "APITimeoutError"):
        setattr(g, n, type(n, (Exception,), {"__init__": lambda self, *a, **k: None}))
    sys.modules["groq"] = g

# heavy document readers (PyMuPDF, OCR ...) are irrelevant here: stub the whole module
sys.modules.setdefault("app.services.doc_extractor", types.SimpleNamespace(extract_text_from_url=lambda url: ""))

from app.workers import stream_consumer as sc  # noqa: E402


class FakeCursor:
    def __init__(self, conn):
        self.c = conn

    def execute(self, sql, params=None):
        self.c.sql.append(" ".join(sql.split()))
        self.last = self.c.sql[-1]

    def fetchone(self):
        if "FOR UPDATE" in self.last:
            return self.c.locked
        if self.last.startswith('SELECT status, "stoppedAt"'):
            return self.c.state
        return None

    def close(self):
        pass


class FakeConn:
    def __init__(self, state, locked=None):
        self.state, self.locked = state, locked if locked is not None else state
        self.sql, self.commits, self.rollbacks, self.closed = [], 0, 0, False

    def cursor(self):
        return FakeCursor(self)

    def commit(self):
        self.commits += 1

    def rollback(self):
        self.rollbacks += 1

    def close(self):
        self.closed = True


def role(title):
    r = types.SimpleNamespace(title=title)
    r.model_dump = lambda: {"title": title, "requiredSkills": ["python"]}
    r.model_dump_json = lambda: '{"title": "%s"}' % title
    return r


EVENT = {"jobPostingId": "p1", "companyId": "c1", "fileUrl": "https://x/doc.pdf"}
STOPPED_AT = object()


class StopTest(unittest.TestCase):
    def setUp(self):
        self.conns, self.published, self.marked, self.extracted = [], [], [], []
        self.state = ("pending", None)
        self.locked = None   # None -> same as state

        def get_connection():
            c = FakeConn(self.state, self.locked)
            self.conns.append(c)
            return c

        sc.get_connection = get_connection
        sc.publish = lambda s, d: self.published.append((s, d))
        sc.mark_failed = lambda pid, why: self.marked.append((pid, why))
        sc.extract_text_from_url = lambda url: self.extracted.append(url) or "Looking for a python developer"
        sc.parse_jd = lambda text: types.SimpleNamespace(roles=[role("Backend Dev"), role("Data Dev")])
        sc.embed = lambda text: [0.1] * 4

    def inserted(self):
        return [q for c in self.conns for q in c.sql if q.startswith("INSERT")]

    def test_normal_flow_extracts_inserts_and_announces(self):
        sc.handle(dict(EVENT))
        self.assertEqual(len(self.extracted), 1)
        self.assertEqual(len([q for q in self.inserted() if "JobRole" in q]), 2)
        stream, payload = self.published[-1]
        self.assertEqual(stream, "jd.extracted")
        self.assertEqual(len(payload["roleIds"]), 2)
        self.assertTrue(any(c.commits == 1 for c in self.conns))

    def test_stopped_job_is_not_even_downloaded(self):
        self.state = ("pending", STOPPED_AT)
        sc.handle(dict(EVENT))
        self.assertEqual(self.extracted, [])          # no download, no LLM call
        self.assertEqual(self.inserted(), [])
        self.assertEqual(self.published, [])
        self.assertEqual(self.marked, [])             # and NOT marked failed

    def test_already_extracted_is_not_processed_twice(self):
        self.state = ("extracted", None)
        sc.handle(dict(EVENT))
        self.assertEqual(self.extracted, [])
        self.assertEqual(self.published, [])

    def test_stopped_while_the_llm_was_working_writes_nothing(self):
        self.state = ("pending", None)
        self.locked = ("pending", STOPPED_AT)          # company pressed stop after the first check
        sc.handle(dict(EVENT))
        self.assertEqual(len(self.extracted), 1)       # it did read the doc ...
        self.assertEqual(self.inserted(), [])          # ... but nothing was written
        self.assertEqual(self.published, [])
        self.assertTrue(any(c.rollbacks == 1 and c.commits == 0 for c in self.conns))
        self.assertTrue(all(c.closed for c in self.conns))

    def test_finished_by_another_worker_meanwhile(self):
        self.locked = ("extracted", None)
        sc.handle(dict(EVENT))
        self.assertEqual(self.inserted(), [])
        self.assertEqual(self.published, [])

    def test_unknown_posting_is_ignored(self):
        self.state = None
        self.locked = None
        sc.get_posting_state = lambda pid: None
        sc.handle(dict(EVENT))
        self.assertEqual(self.extracted, [])
        self.assertEqual(self.published, [])


if __name__ == "__main__":
    unittest.main()