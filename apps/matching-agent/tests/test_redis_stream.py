"""Tests retry / reclaim / dead-letter logic of app/core/redis_stream.py against an in-memory fake Redis
(no server and no `redis` package needed)."""
import json
import sys
import types
import unittest


class ResponseError(Exception):
    pass


class FakeClock:
    def __init__(self):
        self.now = 1000.0

    def time(self):
        return self.now

    def sleep(self, s):
        self.now += s


CLOCK = FakeClock()


class FakeRedis:
    def __init__(self):
        self.streams, self.groups, self._seq = {}, {}, 0

    def xgroup_create(self, stream, group, id="0", mkstream=False):
        if (stream, group) in self.groups:
            raise ResponseError("BUSYGROUP")
        self.streams.setdefault(stream, [])
        self.groups[(stream, group)] = {"next": 0, "pending": {}}

    def xadd(self, stream, fields):
        self._seq += 1
        mid = f"{self._seq}-0"
        self.streams.setdefault(stream, []).append((mid, dict(fields)))
        return mid

    def xreadgroup(self, group, consumer, streams, count=1, block=0):
        (stream, _), = streams.items()
        g = self.groups[(stream, group)]
        entries = self.streams[stream][g["next"]:g["next"] + count]
        g["next"] += len(entries)
        for mid, _f in entries:
            g["pending"][mid] = {"consumer": consumer, "at": CLOCK.now, "times": 1}
        return [(stream, entries)] if entries else []

    def xack(self, stream, group, mid):
        self.groups[(stream, group)]["pending"].pop(mid, None)

    def xautoclaim(self, stream, group, consumer, min_idle_time, start_id="0-0", count=10):
        g, out = self.groups[(stream, group)], []
        for mid, p in list(g["pending"].items())[:count]:
            if (CLOCK.now - p["at"]) * 1000 >= min_idle_time:
                p.update(consumer=consumer, at=CLOCK.now, times=p["times"] + 1)
                out.append((mid, dict(next(f for i, f in self.streams[stream] if i == mid))))
        return ("0-0", out, [])

    def xpending_range(self, stream, group, min, max, count):
        p = self.groups[(stream, group)]["pending"].get(min)
        return [{"message_id": min, "consumer": p["consumer"], "times_delivered": p["times"]}] if p else []

    def pending(self, stream, group):
        return list(self.groups[(stream, group)]["pending"])


fake = FakeRedis()
fake_mod = types.ModuleType("redis")
fake_mod.from_url = lambda *a, **k: fake
fake_mod.exceptions = types.SimpleNamespace(ResponseError=ResponseError)
sys.modules["redis"] = fake_mod

from app.core import redis_stream as rs  # noqa: E402

rs.time = CLOCK


class Stop(BaseException):
    """Used to break out of the infinite consume_loop in tests."""


class RetryTest(unittest.TestCase):
    def setUp(self):
        fake.streams.clear()
        fake.groups.clear()
        self.stream, self.group = "s", "g"
        rs.ensure_group(self.stream, self.group)

    def _deliver(self):
        return fake.xreadgroup(self.group, "c1", {self.stream: ">"}, count=10)[0][1]

    def test_success_is_acked(self):
        rs.publish(self.stream, {"a": 1})
        seen = []
        for mid, fields in self._deliver():
            rs._process(self.stream, self.group, mid, fields, seen.append, None, 1)
        self.assertEqual(seen, [{"a": 1}])
        self.assertEqual(fake.pending(self.stream, self.group), [])

    def test_failed_message_is_retried_after_idle_then_succeeds(self):
        rs.publish(self.stream, {"a": 1})
        calls = {"n": 0}

        def flaky(data):
            calls["n"] += 1
            if calls["n"] == 1:
                raise RuntimeError("groq down")

        for mid, fields in self._deliver():
            rs._process(self.stream, self.group, mid, fields, flaky, None, 1)
        self.assertEqual(len(fake.pending(self.stream, self.group)), 1)  # not acked, not lost

        rs._reclaim(self.stream, self.group, "c1", flaky, None)          # too early: nothing idle yet
        self.assertEqual(calls["n"], 1)
        CLOCK.sleep(61)
        rs._reclaim(self.stream, self.group, "c1", flaky, None)          # idle > 60s -> retried
        self.assertEqual(calls["n"], 2)
        self.assertEqual(fake.pending(self.stream, self.group), [])

    def test_poison_message_goes_to_dead_letter_and_calls_on_dead(self):
        rs.publish(self.stream, {"resumeId": "r1"})
        dead = []
        handler = lambda d: (_ for _ in ()).throw(ValueError("always broken"))
        for mid, fields in self._deliver():
            rs._process(self.stream, self.group, mid, fields, handler, lambda d, e: dead.append((d, str(e))), 1)
        for _ in range(rs.MAX_DELIVERIES + 1):
            CLOCK.sleep(61)
            rs._reclaim(self.stream, self.group, "c1", handler, lambda d, e: dead.append((d, str(e))))
        self.assertEqual(fake.pending(self.stream, self.group), [])
        self.assertEqual(len(fake.streams[f"{self.stream}.dead"]), 1)
        self.assertEqual(len(dead), 1)
        self.assertEqual(dead[0][0], {"resumeId": "r1"})

    def test_undecodable_message_is_dead_lettered_immediately(self):
        fake.xadd(self.stream, {"data": "{not json"})
        called = []
        for mid, fields in self._deliver():
            rs._process(self.stream, self.group, mid, fields, called.append, None, 1)
        self.assertEqual(called, [])
        self.assertEqual(fake.pending(self.stream, self.group), [])
        self.assertEqual(len(fake.streams[f"{self.stream}.dead"]), 1)

    def test_consume_loop_processes_new_messages(self):
        rs.publish(self.stream, {"n": 1})
        rs.publish(self.stream, {"n": 2})
        seen, reads = [], {"n": 0}
        real = fake.xreadgroup

        def limited(*a, **k):
            reads["n"] += 1
            if reads["n"] > 2:
                raise Stop()
            return real(*a, **k)

        fake.xreadgroup = limited
        try:
            with self.assertRaises(Stop):
                rs.consume_loop(self.stream, self.group, "c1", seen.append)
        finally:
            fake.xreadgroup = real
        self.assertEqual([d["n"] for d in seen], [1, 2])
        self.assertEqual(fake.pending(self.stream, self.group), [])


if __name__ == "__main__":
    unittest.main()