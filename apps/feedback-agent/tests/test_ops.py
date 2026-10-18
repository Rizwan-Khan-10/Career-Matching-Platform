"""Contract section 3 hygiene: MAXLEN + requestId on every XADD, JSON logs, /health degraded, /docs off, no REDIS_REDIS_URL fallback."""
import importlib
import json
import logging
import os
import threading
import unittest
from unittest import mock

from app import main
from app.core import config, health_state
from app.core import redis_stream as rs
from app.core.logging_setup import JsonFormatter, request_id_var


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

    def test_publish_trims_the_stream_and_adds_a_request_id(self):
        rs.publish("prep.ready", {"matchId": "m1"})

        stream, fields, maxlen, approximate = self.fake.added[0]
        self.assertEqual((stream, maxlen, approximate), ("prep.ready", 10000, True))
        payload = json.loads(fields["data"])
        self.assertEqual(payload["matchId"], "m1")
        self.assertTrue(payload["requestId"])

    def test_publish_keeps_a_given_request_id(self):
        rs.publish("x", {"requestId": "keep-me"})

        self.assertEqual(json.loads(self.fake.added[0][1]["data"])["requestId"], "keep-me")

    def test_events_published_while_handling_a_message_copy_its_request_id(self):
        def handler(data):
            rs.publish("rejection-feedback.ready", {"n": 1})

        rs._process("candidate.rejected", "g", "1-0", {"data": json.dumps({"requestId": "REQ-A"})}, handler, None, 1)

        self.assertEqual(json.loads(self.fake.added[0][1]["data"])["requestId"], "REQ-A")
        self.assertEqual(self.fake.acked, ["1-0"])

    def test_a_message_without_request_id_does_not_inherit_the_previous_one(self):
        seen = []
        rs._process("s", "g", "1-0", {"data": json.dumps({"requestId": "OLD"})}, lambda d: seen.append(request_id_var.get()), None, 1)
        rs._process("s", "g", "2-0", {"data": json.dumps({})}, lambda d: seen.append(request_id_var.get()), None, 1)

        self.assertEqual(seen[0], "OLD")
        self.assertIsNone(seen[1])

    def test_dead_letter_is_trimmed_too(self):
        def boom(data):
            raise RuntimeError("always broken")

        rs._process("s", "g", "1-0", {"data": json.dumps({"a": 1})}, boom, None, rs.MAX_DELIVERIES)

        stream, fields, maxlen, approximate = self.fake.added[0]
        self.assertEqual((stream, maxlen, approximate), ("s.dead", 10000, True))
        self.assertEqual(fields["origId"], "1-0")
        self.assertEqual(self.fake.acked, ["1-0"])


class HealthTest(unittest.TestCase):
    def setUp(self):
        health_state.reset()

    def tearDown(self):
        health_state.reset()

    def body(self, response):
        return response.status_code, json.loads(response.body)

    def test_ok_while_the_consumer_runs(self):
        health_state.set_startup("running")
        stop = threading.Event()
        t = threading.Thread(target=lambda: (health_state.register_loop("candidate.rejected"), stop.wait(5)), daemon=True)
        t.start()
        self.addCleanup(stop.set)
        while "candidate.rejected" not in health_state.snapshot()["loops"]:
            pass

        status, body = self.body(main.health())

        self.assertEqual(status, 200)
        self.assertEqual(body["status"], "ok")

    def test_ok_when_the_consumer_is_switched_off(self):
        health_state.set_startup("disabled")

        self.assertEqual(self.body(main.health())[0], 200)

    def test_degraded_when_a_consumer_thread_died(self):
        t = threading.Thread(target=lambda: health_state.register_loop("candidate.shortlisted"))
        t.start()
        t.join()

        status, body = self.body(main.health())

        self.assertEqual(status, 503)
        self.assertEqual(body["status"], "degraded")
        self.assertIn("candidate.shortlisted", body["errors"])

    def test_degraded_when_a_loop_reported_that_it_stopped_or_startup_failed(self):
        health_state.set_startup("failed", "boom")

        status, body = self.body(main.health())

        self.assertEqual((status, body["status"]), (503, "degraded"))
        self.assertIn("startup", body["errors"])


class ConfigAndDocsTest(unittest.TestCase):
    def test_docs_are_off_by_default(self):
        self.assertIsNone(main.app.docs_url)
        self.assertIsNone(main.app.openapi_url)

    def test_redis_url_has_no_redis_redis_url_fallback(self):
        env = {k: v for k, v in os.environ.items() if k not in ("REDIS_URL", "REDIS_REDIS_URL")}
        env["REDIS_REDIS_URL"] = "redis://wrong-host:1"
        try:
            with mock.patch.dict(os.environ, env, clear=True), mock.patch("dotenv.load_dotenv"):   # a local .env must not matter
                importlib.reload(config)
                self.assertEqual(config.REDIS_URL, "redis://localhost:6379")
        finally:
            importlib.reload(config)

    def test_flags_parse_true_and_false(self):
        for value, expected in (("true", True), ("TRUE", True), ("false", False), ("", False)):
            with mock.patch.dict(os.environ, {"ENABLE_DOCS": value}):
                self.assertEqual(config._flag("ENABLE_DOCS", "false"), expected)


class JsonLogTest(unittest.TestCase):
    def test_one_json_line_with_ts_level_service_request_id_and_msg(self):
        request_id_var.set("REQ-1")
        self.addCleanup(request_id_var.set, None)
        record = logging.LogRecord("feedback.worker", logging.INFO, __file__, 1, "match %s skipped", ("m1",), None)

        line = json.loads(JsonFormatter().format(record))

        self.assertEqual(line["msg"], "match m1 skipped")
        self.assertEqual((line["level"], line["service"], line["requestId"]), ("INFO", "feedback-agent", "REQ-1"))
        self.assertTrue(line["ts"])


if __name__ == "__main__":
    unittest.main()
