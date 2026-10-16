"""pdf_consumer: which resume gets loaded + requestId in its events. DB / Cloudinary are faked."""
import sys
import types
import unittest

if "redis" not in sys.modules:   # no server / package needed
    m = types.ModuleType("redis")
    m.from_url = lambda *a, **k: None
    m.exceptions = types.SimpleNamespace(ResponseError=Exception)
    sys.modules["redis"] = m

from app.core import db as dbmod                 # noqa: E402
from app.workers import pdf_consumer as pc       # noqa: E402


class FakeCursor:
    def __init__(self, conn):
        self.conn = conn

    def execute(self, sql, params=None):
        self.conn.queries.append((" ".join(sql.split()), params))

    def fetchone(self):
        return self.conn.row

    def close(self):
        pass


class FakeConn:
    def __init__(self, row=None):
        self.row, self.queries, self.closed = row, [], False

    def cursor(self):
        return FakeCursor(self)

    def commit(self):
        pass

    def close(self):
        self.closed = True


class LoadResumeTest(unittest.TestCase):
    def setUp(self):
        self._orig = dbmod.get_connection

    def tearDown(self):
        dbmod.get_connection = self._orig

    def use(self, conn):
        dbmod.get_connection = lambda: conn
        return conn

    def test_by_id_also_checks_the_owner(self):
        conn = self.use(FakeConn(("res1", "a1", "resumes/a1/1-cv.pdf", None)))
        got = pc._load_resume("res1", "a1")
        self.assertEqual(got, {"id": "res1", "applicantId": "a1", "cloudinaryPublicId": "resumes/a1/1-cv.pdf", "pdfPublicId": None})
        sql, params = conn.queries[0]
        self.assertIn('WHERE id = %s AND "applicantId" = %s', sql)
        self.assertEqual(params, ("res1", "a1"))
        self.assertTrue(conn.closed)

    def test_without_resume_id_uses_the_active_resume(self):
        conn = self.use(FakeConn(("res2", "a1", "resumes/a1/2-cv.pdf", None)))
        self.assertEqual(pc._load_resume(None, "a1")["id"], "res2")
        sql, params = conn.queries[0]
        self.assertIn("status = 'parsed'", sql)
        self.assertIn('"confirmedAt" IS NOT NULL', sql)
        self.assertIn('"supersededAt" IS NULL', sql)
        self.assertIn('ORDER BY "confirmedAt" DESC', sql)
        self.assertEqual(params, ("a1",))
        self.assertTrue(conn.closed)

    def test_no_row_returns_none(self):
        self.use(FakeConn(None))
        self.assertIsNone(pc._load_resume(None, "a1"))
        self.assertIsNone(pc._load_resume("nope", "a1"))


class RequestIdTest(unittest.TestCase):
    def setUp(self):
        self.published = []
        self._orig = (pc.publish, pc._load_resume)
        pc.publish = lambda stream, data: self.published.append((stream, data))
        pc._load_resume = lambda rid, aid: None   # -> 'resume.pdf.failed'
        self.event = {"matchId": "m1", "applicantId": "a1", "jobRoleId": "r1"}

    def tearDown(self):
        pc.publish, pc._load_resume = self._orig

    def test_request_id_is_copied(self):
        pc.handle({**self.event, "requestId": "req-7"})
        self.assertEqual(self.published[-1][0], "resume.pdf.failed")
        self.assertEqual(self.published[-1][1]["requestId"], "req-7")

    def test_request_id_is_created_when_missing(self):
        pc.handle(self.event)
        self.assertTrue(self.published[-1][1]["requestId"])

    def test_on_dead_keeps_request_id(self):
        pc.on_dead({**self.event, "requestId": "req-9"}, RuntimeError("boom"))
        self.assertEqual(self.published[-1][1]["requestId"], "req-9")


if __name__ == "__main__":
    unittest.main()