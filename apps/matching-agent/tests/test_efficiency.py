"""Efficiency rules (contract §8): inputHash, best-first early stop, LRU caches, best resume per pair, prefilter, stats."""
import os
import unittest
from types import SimpleNamespace

os.environ.setdefault("EMBEDDING_BACKEND", "hash")
from tests import _shims  # noqa: E402
_shims.install()

from app.services import run_stats  # noqa: E402
from app.services.input_hash import compute_input_hash  # noqa: E402
from app.services.retrieval import best_per_applicant, prefilter_skips, scan_best_first  # noqa: E402
from app.services.side_cache import LRUCache, cache_stats, clear_caches, get_resume_side, get_role_side  # noqa: E402
from app.services.features import build_role_side, build_resume_side  # noqa: E402
from app.services.scan_report import scan_entry  # noqa: E402


class InputHashTest(unittest.TestCase):
    base = dict(resume_id="r1", parsed_data={"skills": ["Java"]}, role_title="Dev",
                requirements={"requiredSkills": ["Java"]}, model_version="m1")

    def h(self, **over):
        return compute_input_hash(**{**self.base, **over})

    def test_same_input_same_hash_regardless_of_key_order(self):
        self.assertEqual(self.h(), self.h())
        self.assertEqual(self.h(requirements={"requiredSkills": ["Java"], "minCgpa": 7}),
                         self.h(requirements={"minCgpa": 7, "requiredSkills": ["Java"]}))

    def test_every_input_changes_the_hash(self):
        for over in ({"resume_id": "r2"}, {"parsed_data": {"skills": ["Java", "Go"]}}, {"role_title": "Lead"},
                     {"requirements": {"requiredSkills": ["Go"]}}, {"model_version": "m2"}, {"academic": {"cgpa": 7.0}}):
            self.assertNotEqual(self.h(), self.h(**over), over)

    def test_salary_never_changes_the_hash(self):
        with_salary = {"requiredSkills": ["Java"], "salaryMin": 400000, "salaryMax": 600000, "salaryCurrency": "INR", "salaryPeriod": "year"}
        self.assertEqual(self.h(), self.h(requirements=with_salary))
        self.assertEqual(self.h(requirements=with_salary), self.h(requirements={**with_salary, "salaryMax": 900000}))

    def test_academic_values_only_matter_when_given(self):
        self.assertEqual(self.h(), self.h(academic=None))
        self.assertNotEqual(self.h(academic={"cgpa": 7.0}), self.h(academic={"cgpa": 8.0}))

    def test_scan_entry_carries_the_hash(self):
        r = SimpleNamespace(eligible=True, score=0.7)
        self.assertEqual(scan_entry("role", "a", "res", r, "abc")["inputHash"], "abc")


class EarlyStopTest(unittest.TestCase):
    def run_loop(self, flags, **kw):
        """flags[i] = candidate i is eligible; returns (info, pages fetched)."""
        pages = []

        def fetch(offset, limit):
            pages.append((offset, limit))
            return list(range(offset, min(offset + limit, len(flags))))

        info = scan_best_first(fetch, lambda rows: sum(flags[i] for i in rows), **kw)
        return info, pages

    def test_stops_after_two_consecutive_batches_without_eligible(self):
        flags = [True] * 5 + [False] * 95
        info, pages = self.run_loop(flags, top_k=100, batch_size=10, max_eligible=200, empty_batches_stop=2)
        self.assertEqual(info["stoppedBy"], "empty_batches")
        self.assertEqual(info["retrieved"], 30)               # batch 1 has eligible, batches 2 and 3 are empty -> stop
        self.assertEqual(len(pages), 3)

    def test_an_eligible_batch_resets_the_empty_counter(self):
        flags = [False] * 10 + [True] + [False] * 49
        info, _ = self.run_loop(flags, top_k=100, batch_size=10, max_eligible=200, empty_batches_stop=2)
        self.assertEqual(info["retrieved"], 40)               # empty, eligible, empty, empty -> stop

    def test_stops_at_max_eligible(self):
        info, _ = self.run_loop([True] * 100, top_k=100, batch_size=10, max_eligible=25, empty_batches_stop=2)
        self.assertEqual(info["stoppedBy"], "max_eligible")
        self.assertEqual(info["retrieved"], 30)

    def test_never_retrieves_more_than_top_k_and_last_page_is_trimmed(self):
        info, pages = self.run_loop([True] * 100, top_k=35, batch_size=25, max_eligible=200)
        self.assertEqual((info["retrieved"], info["stoppedBy"]), (35, "top_k"))
        self.assertEqual(pages, [(0, 25), (25, 10)])

    def test_exhausted_candidates(self):
        info, _ = self.run_loop([True] * 7, top_k=100, batch_size=25)
        self.assertEqual((info["retrieved"], info["stoppedBy"]), (7, "exhausted"))
        self.assertEqual(scan_best_first(lambda o, l: [], lambda r: 0, top_k=10)["retrieved"], 0)


class BestResumePerApplicantTest(unittest.TestCase):
    def s(self, applicant, resume, score, eligible):
        return {"cand": {"applicantId": applicant, "resumeId": resume}, "result": SimpleNamespace(score=score, eligible=eligible)}

    def test_one_per_applicant_best_wins(self):
        out = best_per_applicant([self.s("a", "r1", 0.6, True), self.s("a", "r2", 0.8, True), self.s("b", "r3", 0.3, False)])
        self.assertEqual([(o["cand"]["applicantId"], o["cand"]["resumeId"]) for o in out], [("a", "r2"), ("b", "r3")])

    def test_eligible_beats_higher_scoring_ineligible(self):
        out = best_per_applicant([self.s("a", "r1", 0.49, False), self.s("a", "r2", 0.52, True)])
        self.assertEqual(out[0]["cand"]["resumeId"], "r2")

    def test_tie_is_deterministic(self):
        a = best_per_applicant([self.s("a", "r1", 0.6, True), self.s("a", "r2", 0.6, True)])
        b = best_per_applicant([self.s("a", "r2", 0.6, True), self.s("a", "r1", 0.6, True)])
        self.assertEqual(a[0]["cand"]["resumeId"], b[0]["cand"]["resumeId"])


class SideCacheTest(unittest.TestCase):
    def setUp(self):
        clear_caches()

    def test_lru_evicts_least_recently_used(self):
        c = LRUCache(2)
        c.get_or_build("a", lambda: 1)
        c.get_or_build("b", lambda: 2)
        c.get_or_build("a", lambda: 99)                       # touch a -> b is now the oldest
        c.get_or_build("c", lambda: 3)
        built = []
        c.get_or_build("b", lambda: built.append(1) or 2)     # was evicted -> rebuilt
        c.get_or_build("a", lambda: built.append(2) or 1)     # was evicted by the insert of b (size 2: c, b) -> rebuilt
        self.assertEqual(c.stats()["size"], 2)
        self.assertEqual(built, [1, 2])

    def test_hit_and_miss_counters(self):
        c = LRUCache(5)
        for _ in range(3):
            c.get_or_build("k", lambda: 1)
        self.assertEqual((c.stats()["hits"], c.stats()["misses"]), (2, 1))

    def test_resume_side_cached_per_content_and_rebuilt_when_resume_changes(self):
        p = {"skills": ["Java"]}
        a = get_resume_side("r1", p)
        self.assertIs(a, get_resume_side("r1", {"skills": ["Java"]}))      # same content -> same object
        self.assertIsNot(a, get_resume_side("r1", {"skills": ["Java", "Go"]}))  # edited resume -> never stale
        self.assertEqual(cache_stats()["resumeSide"]["hits"], 1)

    def test_role_side_cached_once_for_many_resumes(self):
        for _ in range(5):
            get_role_side("role", "Dev", {"requiredSkills": ["Java"]})
        self.assertEqual((cache_stats()["roleSide"]["hits"], cache_stats()["roleSide"]["misses"]), (4, 1))


class PrefilterTest(unittest.TestCase):
    def sides(self, resume_skills, required):
        return (build_resume_side({"skills": resume_skills}), build_role_side("Dev", {"requiredSkills": required}))

    def test_off_by_default(self):
        rs, ro = self.sides(["Excel"], ["Kubernetes"])
        self.assertFalse(prefilter_skips(rs, ro))

    def test_skips_only_when_no_exact_skill_and_low_cosine(self):
        rs, ro = self.sides(["Excel"], ["Kubernetes"])
        self.assertTrue(prefilter_skips(rs, ro, min_cosine=1.1))      # cosine is always below 1.1
        self.assertFalse(prefilter_skips(rs, ro, min_cosine=-1.0))    # cosine never below -1
        rs, ro = self.sides(["Kubernetes", "Excel"], ["k8s"])
        self.assertFalse(prefilter_skips(rs, ro, min_cosine=1.1))     # alias-normalised exact hit -> never prefiltered
        rs, ro = self.sides(["Excel"], [])
        self.assertFalse(prefilter_skips(rs, ro, min_cosine=1.1))     # role lists no required skills -> never prefiltered


class RunStatsTest(unittest.TestCase):
    def test_run_is_recorded_with_all_counters(self):
        run_stats.reset()
        r = run_stats.Run("jd.extracted", "role1")
        for name, n in (("retrieved", 30), ("gatedOut", 4), ("prefiltered", 1), ("skippedByHash", 9), ("scored", 20), ("eligible", 6)):
            r.add(name, n)
        r.stoppedBy = "empty_batches"
        r.finish()
        snap = run_stats.snapshot()
        self.assertEqual(snap["totals"]["scored"], 20)
        self.assertEqual(snap["totals"]["runs"], 1)
        rec = snap["recent"][0]
        self.assertEqual((rec["trigger"], rec["subject"], rec["skippedByHash"], rec["stoppedBy"]), ("jd.extracted", "role1", 9, "empty_batches"))
        self.assertIn("ms", rec)

    def test_stats_endpoint_shape(self):
        os.environ["ENABLE_MATCHING_CONSUMER"] = "false"     # importing app.main must not start Redis consumers
        try:
            from fastapi.testclient import TestClient
            from app import main
        except Exception as exc:  # fastapi / httpx not installed on a bare machine
            self.skipTest(f"fastapi test client unavailable: {exc}")
        from app.core import health_state
        health_state.set_startup("disabled")   # (the consumer now starts in the app lifespan, not on import)
        from app.core import config; config.INTERNAL_API_KEY = ""   # tests must not depend on the developer's .env
        body = TestClient(main.app).get("/stats").json()
        self.assertEqual(set(body), {"since", "totals", "recent", "cache"})
        self.assertEqual(set(body["cache"]), {"resumeSide", "roleSide"})


if __name__ == "__main__":
    unittest.main()