"""Contract §3 hygiene: MAXLEN + requestId on every XADD, JSON logs, x-internal-key, /health degraded, /docs off.
Redis, DB and the embedder are faked; no network is needed."""
import io
import json
import logging
import os
import threading
import types
import unittest

os.environ.setdefault("EMBEDDING_BACKEND", "hash")
from tests import _shims  # noqa: E402
_shims.install()

from fastapi.testclient import TestClient            # noqa: E402

from app import main                                  # noqa: E402
from app.core import config, health_state             # noqa: E402
from app.core import redis_stream as rs               # noqa: E402
from app.core.logging_setup import JsonFormatter, request_id_var  # noqa: E402


class FakeRedis:
    def __init__(self):
        self.added, self.acked = [], []

    def xadd(self, stream, fields, maxlen=None, approximate=True):
        self.added.append((stream, fields, maxlen, approximate))

    def xack(self, stream, group, msg_id):
        self.acked.append(msg_id)


class StreamHygieneTest(unittest.TestCase):
    def setUp(self):
        self.fake, self._orig = FakeRedis(), rs.r
        rs.r = self.fake
        request_id_var.set(None)

    def tearDown(self):
        rs.r = self._orig
        request_id_var.set(None)

    def test_publish_trims_stream_and_adds_request_id(self):
        rs.publish("match.computed", {"applicantId": "a1"})
        stream, fields, maxlen, approximate = self.fake.added[0]
        self.assertEqual((stream, maxlen, approximate), ("match.computed", 10000, True))
        payload = json.loads(fields["data"])
        self.assertEqual(payload["applicantId"], "a1")
        self.assertTrue(payload["requestId"])

    def test_publish_keeps_given_request_id(self):
        rs.publish("x", {"requestId": "keep-me"})
        self.assertEqual(json.loads(self.fake.added[0][1]["data"])["requestId"], "keep-me")

    def test_events_published_while_handling_a_message_copy_its_request_id(self):
        def handler(data):
            rs.publish("match.computed", {"n": 1})
            rs.publish("match.scanned", {"n": 2})

        rs._process("resume.confirmed", "g", "1-0", {"data": json.dumps({"requestId": "REQ-A"})}, handler, None, 1)
        ids = [json.loads(f["data"])["requestId"] for _, f, _, _ in self.fake.added]
        self.assertEqual(ids, ["REQ-A", "REQ-A"])

    def test_one_new_id_is_shared_by_a_run_without_request_id_and_does_not_leak(self):
        seen = []

        def handler(data):
            rs.publish("a", {})
            rs.publish("b", {})
            seen.append(request_id_var.get())

        rs._process("s", "g", "1-0", {"data": json.dumps({"x": 1})}, handler, None, 1)
        rs._process("s", "g", "2-0", {"data": json.dumps({"x": 2})}, handler, None, 1)
        ids = [json.loads(f["data"])["requestId"] for _, f, _, _ in self.fake.added]
        self.assertEqual(ids[0], ids[1])
        self.assertEqual(ids[2], ids[3])
        self.assertNotEqual(ids[0], ids[2])

    def test_dead_letter_is_trimmed_and_acked(self):
        def boom(data):
            raise RuntimeError("down")

        calls = []
        rs._process("s", "g", "3-0", {"data": json.dumps({"a": 1})}, boom, lambda d, e: calls.append(str(e)), rs.MAX_DELIVERIES)
        stream, _, maxlen, _ = self.fake.added[0]
        self.assertEqual((stream, maxlen), ("s.dead", 10000))
        self.assertEqual(self.fake.acked, ["3-0"])
        self.assertEqual(calls, ["down"])


class JsonLogTest(unittest.TestCase):
    def test_line_has_ts_level_service_request_id_msg(self):
        buf = io.StringIO()
        handler = logging.StreamHandler(buf)
        handler.setFormatter(JsonFormatter())
        lg = logging.getLogger("matching.test")
        lg.handlers, lg.propagate = [handler], False
        request_id_var.set("req-9")
        try:
            lg.warning("scored %d roles", 3)
        finally:
            request_id_var.set(None)
        line = json.loads(buf.getvalue())
        self.assertEqual({"ts", "level", "service", "requestId", "msg"}, set(line))
        self.assertEqual((line["level"], line["service"], line["requestId"], line["msg"]),
                         ("WARNING", "matching-agent", "req-9", "scored 3 roles"))


class HealthTest(unittest.TestCase):
    def setUp(self):
        health_state.reset()
        self.client = TestClient(main.app)   # no `with`: lifespan (consumer thread) does not run

    def tearDown(self):
        health_state.reset()

    def test_ok_while_starting_running_or_disabled(self):
        for status in ("starting", "running", "disabled"):
            health_state.set_startup(status)
            res = self.client.get("/health")
            self.assertEqual((res.status_code, res.json()["status"]), (200, "ok"), status)

    def test_503_degraded_when_startup_failed(self):
        health_state.set_startup("failed", "db down")
        res = self.client.get("/health")
        self.assertEqual(res.status_code, 503)
        self.assertEqual(res.json()["status"], "degraded")
        self.assertEqual(res.json()["errors"], {"startup": "db down"})

    def test_503_when_a_consumer_loop_stopped(self):
        health_state.register_loop("resume.confirmed")
        self.assertEqual(self.client.get("/health").status_code, 200)
        health_state.loop_stopped("resume.confirmed")
        res = self.client.get("/health")
        self.assertEqual(res.status_code, 503)
        self.assertIn("resume.confirmed", res.json()["errors"])

    def test_503_when_a_consumer_thread_died(self):
        t = threading.Thread(target=lambda: health_state.register_loop("jd.extracted"))
        t.start()
        t.join()   # registered from a thread that is now dead
        res = self.client.get("/health")
        self.assertEqual(res.status_code, 503)
        self.assertEqual(res.json()["errors"], {"jd.extracted": "consumer thread died"})

    def test_consume_loop_marks_itself_stopped_when_it_exits(self):
        class Stop(BaseException):
            pass

        fake = types.SimpleNamespace(
            xgroup_create=lambda *a, **k: None,
            xautoclaim=lambda *a, **k: (None, [], []),
            xreadgroup=lambda *a, **k: (_ for _ in ()).throw(Stop()))
        orig, rs.r = rs.r, fake
        try:
            with self.assertRaises(Stop):
                rs.consume_loop("s", "g", "c", lambda d: None)
        finally:
            rs.r = orig
        self.assertIn("s", health_state.failures())

    @unittest.skipIf(config.ENABLE_DOCS, "ENABLE_DOCS=true in your .env")
    def test_docs_are_off_by_default(self):
        self.assertEqual(self.client.get("/docs").status_code, 404)
        self.assertEqual(self.client.get("/openapi.json").status_code, 404)


class InternalKeyTest(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(main.app)
        self._orig = config.INTERNAL_API_KEY

    def tearDown(self):
        config.INTERNAL_API_KEY = self._orig

    def test_no_key_configured_means_no_check(self):
        config.INTERNAL_API_KEY = None
        self.assertNotEqual(self.client.get("/model").status_code, 401)

    def test_health_is_always_open(self):
        config.INTERNAL_API_KEY = "secret"
        self.assertEqual(self.client.get("/health").status_code, 200)

    def test_other_routes_need_the_key(self):
        config.INTERNAL_API_KEY = "secret"
        self.assertEqual(self.client.get("/model").status_code, 401)
        self.assertEqual(self.client.get("/model", headers={"x-internal-key": "wrong"}).status_code, 401)
        self.assertNotEqual(self.client.get("/model", headers={"x-internal-key": "secret"}).status_code, 401)


if __name__ == "__main__":
    unittest.main()