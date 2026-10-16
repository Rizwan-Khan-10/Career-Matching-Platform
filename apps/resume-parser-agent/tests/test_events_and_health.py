"""MAXLEN + requestId in streams, resume.parsed payload, /health degraded. Redis / DB / LLM / embedder are faked."""
import json
import os
import sys
import threading
import types
import unittest

os.environ.setdefault("GROQ_API_KEY", "test-key")   # Groq client is built at import time; no request is sent

if "redis" not in sys.modules:
    m = types.ModuleType("redis")
    m.from_url = lambda *a, **k: None
    m.exceptions = types.SimpleNamespace(ResponseError=Exception)
    sys.modules["redis"] = m

if "app.core.embeddings" not in sys.modules:   # the real one loads a ~90 MB model; tests only need the names
    stub = types.ModuleType("app.core.embeddings")
    stub.embed = lambda text: [0.0] * 384
    stub.to_pgvector = lambda vec: "[0]"
    sys.modules["app.core.embeddings"] = stub

from fastapi.testclient import TestClient            # noqa: E402

from app import main                                  # noqa: E402
from app.core import config                           # noqa: E402
from app.core import redis_stream as rs               # noqa: E402
from app.core.logging_setup import request_id_var     # noqa: E402
from app.models.resume import ParsedResumeData        # noqa: E402
from app.workers import stream_consumer as sc         # noqa: E402


class FakeRedis:
    def __init__(self):
        self.added, self.acked = [], []

    def xadd(self, stream, fields, maxlen=None, approximate=True):
        self.added.append((stream, fields, maxlen, approximate))

    def xack(self, stream, group, msg_id):
        self.acked.append(msg_id)


class RedisStreamTest(unittest.TestCase):
    def setUp(self):
        self.fake, self._orig = FakeRedis(), rs.r
        rs.r = self.fake
        request_id_var.set(None)

    def tearDown(self):
        rs.r = self._orig
        request_id_var.set(None)

    def test_publish_trims_stream_and_adds_request_id(self):
        rs.publish("resume.parsed", {"resumeId": "r1"})
        stream, fields, maxlen, approximate = self.fake.added[0]
        self.assertEqual((stream, maxlen, approximate), ("resume.parsed", 10000, True))
        payload = json.loads(fields["data"])
        self.assertEqual(payload["resumeId"], "r1")
        self.assertTrue(payload["requestId"])

    def test_publish_keeps_given_request_id(self):
        rs.publish("x", {"requestId": "keep-me"})
        self.assertEqual(json.loads(self.fake.added[0][1]["data"])["requestId"], "keep-me")

    def test_publish_uses_id_of_message_being_handled(self):
        request_id_var.set("ctx-1")
        rs.publish("x", {})
        self.assertEqual(json.loads(self.fake.added[0][1]["data"])["requestId"], "ctx-1")

    def test_request_id_does_not_leak_between_messages(self):
        seen = []
        handler = lambda data: seen.append(request_id_var.get())
        rs._process("s", "g", "1-0", {"data": json.dumps({"requestId": "A"})}, handler, None, 1)
        rs._process("s", "g", "2-0", {"data": json.dumps({"x": 1})}, handler, None, 1)
        self.assertEqual(seen, ["A", None])
        self.assertEqual(self.fake.acked, ["1-0", "2-0"])

    def test_dead_letter_is_trimmed_acked_and_reported(self):
        calls = []

        def boom(data):
            raise RuntimeError("down")

        rs._process("s", "g", "3-0", {"data": json.dumps({"a": 1})}, boom, lambda d, e: calls.append((d, str(e))), rs.MAX_DELIVERIES)
        stream, _, maxlen, _ = self.fake.added[0]
        self.assertEqual((stream, maxlen), ("s.dead", 10000))
        self.assertEqual(self.fake.acked, ["3-0"])
        self.assertEqual(calls, [({"a": 1}, "down")])


class FakeCursor:
    def __init__(self, conn):
        self.conn = conn

    def execute(self, sql, params=None):
        self.conn.queries.append((" ".join(sql.split()), params))

    def close(self):
        pass


class FakeConn:
    def __init__(self):
        self.queries, self.closed = [], False

    def cursor(self):
        return FakeCursor(self)

    def commit(self):
        pass

    def close(self):
        self.closed = True


class ParsedEventTest(unittest.TestCase):
    NAMES = ("publish", "get_connection", "extract_text", "parse_resume", "embed")

    def setUp(self):
        self.published, self.conn = [], FakeConn()
        self._orig = {n: getattr(sc, n) for n in self.NAMES}
        sc.publish = lambda stream, data: self.published.append((stream, data))
        sc.get_connection = lambda: self.conn
        sc.extract_text = lambda url: "some resume text"
        sc.parse_resume = lambda text: ParsedResumeData(
            skills=["Python"], branch="Computer Science", passingYear=2026, backlogs=0, cgpa="8.2/10")
        sc.embed = lambda text: [0.0] * 384
        self.event = {"resumeId": "res1", "applicantId": "a1", "fileUrl": "http://example.test/cv.pdf"}

    def tearDown(self):
        for n, fn in self._orig.items():
            setattr(sc, n, fn)

    def test_parsed_event_has_academic_fields_and_copies_request_id(self):
        sc.handle({**self.event, "requestId": "req-1"})
        stream, payload = self.published[0]
        self.assertEqual(stream, "resume.parsed")
        self.assertEqual((payload["branch"], payload["passingYear"], payload["backlogs"], payload["cgpa"]),
                         ("Computer Science", 2026, 0, 8.2))
        self.assertEqual(payload["requestId"], "req-1")
        self.assertEqual(self.conn.queries[0][1][0], "parsed")
        self.assertTrue(self.conn.closed)

    def test_request_id_is_created_when_missing(self):
        sc.handle(self.event)
        self.assertTrue(self.published[0][1]["requestId"])

    def test_content_error_marks_failed_and_publishes_nothing(self):
        def bad(url):
            raise ValueError("bad file")

        sc.extract_text = bad
        sc.handle(self.event)
        self.assertEqual(self.published, [])
        self.assertEqual(self.conn.queries[0][1][0], "failed")
        self.assertTrue(self.conn.closed)

    def test_on_dead_needs_a_resume_id(self):
        sc.on_dead({}, RuntimeError("x"))
        self.assertEqual(self.conn.queries, [])
        sc.on_dead({"resumeId": "res1"}, RuntimeError("x"))
        self.assertEqual(self.conn.queries[0][1][0], "failed")


class HealthTest(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(main.app)   # no `with`: startup (consumer threads) does not run
        self._saved = {k: dict(v) for k, v in main._consumers.items()}

    def tearDown(self):
        for name, state in self._saved.items():
            main._consumers[name].clear()
            main._consumers[name].update(state)

    def set(self, name, status, error=None, thread=None):
        main._consumers[name].update(status=status, error=error, thread=thread)

    def test_ok_when_running_or_disabled(self):
        self.set("resume_parser", "running")
        self.set("resume_pdf", "disabled")
        res = self.client.get("/health")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["status"], "ok")

    def test_503_degraded_when_a_consumer_failed(self):
        self.set("resume_pdf", "failed", "redis down")
        res = self.client.get("/health")
        self.assertEqual(res.status_code, 503)
        self.assertEqual(res.json()["status"], "degraded")
        self.assertEqual(res.json()["errors"], {"resume_pdf": "redis down"})

    def test_503_when_consumer_thread_died(self):
        t = threading.Thread(target=lambda: None)
        t.start()
        t.join()
        self.set("resume_parser", "running", thread=t)
        self.assertEqual(self.client.get("/health").status_code, 503)

    def test_root_path_is_health_too(self):
        self.assertEqual(self.client.get("/").status_code, 200)

    @unittest.skipIf(config.ENABLE_DOCS, "ENABLE_DOCS=true in your .env")
    def test_docs_are_off_by_default(self):
        self.assertEqual(self.client.get("/docs").status_code, 404)
        self.assertEqual(self.client.get("/openapi.json").status_code, 404)


if __name__ == "__main__":
    unittest.main()