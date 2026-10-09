"""Worker-level behaviour with DB/Redis faked: scan reports, stopped jobs, publish selection."""
import os
import unittest

os.environ.setdefault("EMBEDDING_BACKEND", "hash")
from tests import _shims  # noqa: E402
_shims.install()

from app.services.scan_report import chunked, scan_entry  # noqa: E402
from app.workers import stream_consumer as sc  # noqa: E402

RESUME = {"resumeId": "res1", "applicantId": "a1",
          "skills": ["React", "JavaScript", "HTML", "CSS", "Redux"],
          "projects": [{"name": "Shop", "description": "Built a storefront with React and REST APIs"}],
          "experienceYears": 3, "education": "B.Tech"}
GOOD = {"jobRoleId": "good", "title": "Frontend Developer", "requirements": {"requiredSkills": ["React", "JavaScript", "HTML", "CSS"], "minExperienceYears": 2}}
BAD = {"jobRoleId": "bad", "title": "DevOps Engineer", "requirements": {"requiredSkills": ["Kubernetes", "Terraform", "AWS", "Linux"], "minExperienceYears": 3}}


class Base(unittest.TestCase):
    def setUp(self):
        self.out = []
        sc.publish = lambda stream, data: self.out.append((stream, data))
        sc.upsert_resume_embedding = lambda *a: None
        sc.upsert_role_embedding = lambda *a: None
        sc.find_matching_roles_for_resume = lambda rid, k: [dict(GOOD), dict(BAD)]
        self.active = True
        sc.is_role_active = lambda rid: self.active

    def streams(self, name):
        return [d for s, d in self.out if s == name]


class ResumeDirectionTest(Base):
    def test_every_evaluated_role_is_reported_and_only_relevant_ones_published(self):
        sc.handle_resume_event(dict(RESUME))
        scans = self.streams("match.scanned")
        self.assertEqual(len(scans), 1)
        by_role = {s["jobRoleId"]: s for s in scans[0]["scans"]}
        self.assertEqual(set(by_role), {"good", "bad"})            # full funnel, even the irrelevant role
        self.assertTrue(by_role["good"]["eligible"])
        self.assertFalse(by_role["bad"]["eligible"])
        self.assertEqual(by_role["good"]["applicantId"], "a1")
        computed = {m["jobRoleId"] for m in self.streams("match.computed")}
        self.assertIn("good", computed)
        self.assertNotIn("bad", computed)                          # hopeless pair: scanned but not published


class RoleDirectionTest(Base):
    def setUp(self):
        super().setUp()
        self.cands = [{"resumeId": "res1", "applicantId": "a1", "parsedData": RESUME},
                      {"resumeId": "res2", "applicantId": "a2", "parsedData": {"skills": ["Excel"], "experienceYears": 0}}]
        sc.find_matching_resumes_for_role = lambda rid, k: self.cands
        self.role = {"jobRoleId": "good", "title": GOOD["title"], "requirements": GOOD["requirements"], "stopped": False}
        sc.get_role = lambda rid: self.role

    def test_active_role_reports_all_candidates(self):
        sc.handle_jd_extracted({"jobPostingId": "p", "companyId": "c", "roleIds": ["good"]})
        scans = self.streams("match.scanned")[0]["scans"]
        self.assertEqual({s["applicantId"] for s in scans}, {"a1", "a2"})
        self.assertEqual([m["applicantId"] for m in self.streams("match.computed") if m["eligible"]], ["a1"])

    def test_stopped_job_is_not_matched_at_all(self):
        self.role["stopped"] = True
        sc.find_matching_resumes_for_role = lambda *a: self.fail("must not even retrieve candidates")
        sc.handle_jd_extracted({"jobPostingId": "p", "companyId": "c", "roleIds": ["good"]})
        self.assertEqual(self.out, [])

    def test_stopped_while_scoring_publishes_nothing(self):
        self.active = False
        sc.handle_jd_extracted({"jobPostingId": "p", "companyId": "c", "roleIds": ["good"]})
        self.assertEqual(self.out, [])

    def test_missing_role_is_skipped(self):
        sc.get_role = lambda rid: None
        sc.handle_jd_extracted({"jobPostingId": "p", "companyId": "c", "roleIds": ["gone"]})
        self.assertEqual(self.out, [])


class ScanReportTest(unittest.TestCase):
    def test_chunking(self):
        sizes = [len(c) for c in chunked(list(range(450)), 200)]
        self.assertEqual(sizes, [200, 200, 50])
        self.assertEqual(list(chunked([], 200)), [])

    def test_entry_shape(self):
        r = type("R", (), {"eligible": 1, "score": 0.5})()
        self.assertEqual(scan_entry("r", "a", None, r), {"jobRoleId": "r", "applicantId": "a", "resumeId": None, "eligible": True, "score": 0.5})


if __name__ == "__main__":
    unittest.main()