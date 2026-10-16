"""MAXLEN + requestId in streams, jd.extracted payload / stored requirements, /health degraded.
Redis / DB / LLM / embedder / document readers are faked."""
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

# heavy document readers (PyMuPDF, OCR ...) are irrelevant here
sys.modules.setdefault("app.services.doc_extractor", types.SimpleNamespace(extract_text_from_url=lambda url: ""))

from fastapi.testclient import TestClient            # noqa: E402

from app import main                                  # noqa: E402
from app.core import config                           # noqa: E402
from app.core import redis_stream as rs               # noqa: E402
from app.core.logging_setup import request_id_var     # noqa: E402
from app.models.jd import JobRoleData                 # noqa: E402
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
        rs.publish("jd.extracted", {"jobPostingId": "p1"})
        stream, fields, maxlen, approximate = self.fake.added[0]
        self.assertEqual((stream, maxlen, approximate), ("jd.extracted", 10000, True))
        payload = json.loads(fields["data"])
        self.assertEqual(payload["jobPostingId"], "p1")
        self.assertTrue(payload["requestId"])

    def test_publish_keeps_given_request_id(self):
        rs.publish("x", {"requestId": "keep-me"})
        self.assertEqual(json.loads(self.fake.added[0][1]["data"])["requestId"], "keep-me")

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
        self.c, self.last = conn, ""

    def execute(self, sql, params=None):
        self.last = " ".join(sql.split())
        self.c.queries.append((self.last, params))

    def fetchone(self):
        return ("pending", None) if "FOR UPDATE" in self.last else None

    def close(self):
        pass


class FakeConn:
    def __init__(self):
        self.queries, self.commits, self.closed = [], 0, False

    def cursor(self):
        return FakeCursor(self)

    def commit(self):
        self.commits += 1

    def rollback(self):
        pass

    def close(self):
        self.closed = True


class ExtractedEventTest(unittest.TestCase):
    NAMES = ("publish", "get_connection", "get_posting_state", "extract_text_from_url", "parse_jd", "embed", "mark_failed")

    def setUp(self):
        self.published, self.marked, self.conn = [], [], FakeConn()
        self._orig = {n: getattr(sc, n) for n in self.NAMES}
        sc.publish = lambda stream, data: self.published.append((stream, data))
        sc.get_connection = lambda: self.conn
        sc.get_posting_state = lambda pid: ("pending", False)
        sc.extract_text_from_url = lambda url: "Hiring a Java backend developer"
        sc.parse_jd = lambda text: types.SimpleNamespace(roles=[
            JobRoleData(title="Backend Developer", requiredSkills=["Java"], track="backend", stacks=["java"], level="fresher")])
        sc.embed = lambda text: [0.0] * 384
        sc.mark_failed = lambda pid, why: self.marked.append((pid, why))
        self.event = {"jobPostingId": "p1", "companyId": "c1", "fileUrl": "https://example.test/jd.pdf"}

    def tearDown(self):
        for n, fn in self._orig.items():
            setattr(sc, n, fn)

    def test_extracted_event_copies_request_id(self):
        sc.handle({**self.event, "requestId": "req-1"})
        stream, payload = self.published[0]
        self.assertEqual(stream, "jd.extracted")
        self.assertEqual((payload["jobPostingId"], payload["companyId"], payload["requestId"]), ("p1", "c1", "req-1"))
        self.assertEqual(len(payload["roleIds"]), 1)
        self.assertEqual(self.conn.commits, 1)
        self.assertTrue(self.conn.closed)

    def test_request_id_is_created_when_missing(self):
        sc.handle(self.event)
        self.assertTrue(self.published[0][1]["requestId"])

    def test_stored_requirements_carry_track_stacks_level_and_null_rules(self):
        sc.handle(self.event)
        insert = next(q for q in self.conn.queries if q[0].startswith('INSERT INTO "jobs_service"."JobRole"'))
        req = json.loads(insert[1][3])
        self.assertEqual((req["track"], req["stacks"], req["level"]), ("backend", ["java"], "fresher"))
        for rule in ("minCgpa", "allowedBranches", "passingYears", "maxBacklogs"):
            self.assertIsNone(req[rule], rule)   # JD did not state them -> rule not set

    def test_content_error_marks_failed_and_publishes_nothing(self):
        def bad(url):
            raise ValueError("bad file")

        sc.extract_text_from_url = bad
        sc.handle(self.event)
        self.assertEqual(self.published, [])
        self.assertEqual(self.marked[0][0], "p1")

    def test_on_dead_needs_a_posting_id(self):
        sc.on_dead({}, RuntimeError("x"))
        self.assertEqual(self.marked, [])
        sc.on_dead({"jobPostingId": "p1"}, RuntimeError("x"))
        self.assertEqual(self.marked[0][0], "p1")


class HealthTest(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(main.app)   # no `with`: startup (consumer thread) does not run
        self._saved = {k: dict(v) for k, v in main._consumers.items()}

    def tearDown(self):
        for name, state in self._saved.items():
            main._consumers[name].clear()
            main._consumers[name].update(state)

    def set(self, status, error=None, thread=None):
        main._consumers["jd_extractor"].update(status=status, error=error, thread=thread)

    def test_ok_when_running_or_disabled(self):
        for status in ("running", "disabled", "starting"):
            self.set(status)
            res = self.client.get("/health")
            self.assertEqual((res.status_code, res.json()["status"]), (200, "ok"), status)

    def test_503_degraded_when_the_consumer_failed(self):
        self.set("failed", "redis down")
        res = self.client.get("/health")
        self.assertEqual(res.status_code, 503)
        self.assertEqual(res.json()["status"], "degraded")
        self.assertEqual(res.json()["errors"], {"jd_extractor": "redis down"})

    def test_503_when_the_consumer_thread_died(self):
        t = threading.Thread(target=lambda: None)
        t.start()
        t.join()
        self.set("running", thread=t)
        self.assertEqual(self.client.get("/health").status_code, 503)

    @unittest.skipIf(config.ENABLE_DOCS, "ENABLE_DOCS=true in your .env")
    def test_docs_are_off_by_default(self):
        self.assertEqual(self.client.get("/docs").status_code, 404)


if __name__ == "__main__":
    unittest.main()