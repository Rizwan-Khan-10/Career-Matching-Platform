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

ACTIVE = {"resumeId": "res1", "applicantId": "a1", "parsedData": RESUME, "targetTrack": "frontend", "targetStack": "javascript"}


class Base(unittest.TestCase):
    def setUp(self):
        self.out = []
        sc.publish = lambda stream, data: self.out.append((stream, data))
        sc.upsert_resume_embedding = lambda *a: None
        sc.upsert_role_embedding = lambda *a: None
        sc.delete_resume_embedding = lambda *a: None
        self.active = True
        sc.is_role_active = lambda rid: self.active
        self.resume_active = True
        sc.is_resume_active = lambda rid: self.resume_active
        self.resumes = {"res1": ACTIVE}                       # active resumes by id
        sc.get_active_resume = lambda rid: self.resumes.get(rid)
        sc.get_active_resumes_for_applicant = lambda aid: [r for r in self.resumes.values() if r["applicantId"] == aid]
        self.calls = []                                        # (resume id, filters) passed to the gated retrieval

        def roles(resume, k, **filters):
            self.calls.append((resume["resumeId"], filters))
            return [dict(GOOD), dict(BAD)]
        sc.find_compatible_roles_for_resume = roles

    def streams(self, name):
        return [d for s, d in self.out if s == name]


class ResumeDirectionTest(Base):
    def test_every_evaluated_role_is_reported_and_only_relevant_ones_published(self):
        sc.handle_resume_event({"resumeId": "res1", "applicantId": "a1", "targetTrack": "frontend", "targetStack": "javascript"})
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

    def test_inactive_resume_is_ignored(self):
        self.resumes.clear()                                       # unconfirmed / superseded / deleted
        sc.handle_resume_event({"resumeId": "res1", "applicantId": "a1"})
        self.assertEqual(self.out, [])
        self.assertEqual(self.calls, [])

    def test_resume_replaced_while_scoring_publishes_nothing(self):
        self.resume_active = False
        sc.handle_resume_event({"resumeId": "res1", "applicantId": "a1"})
        self.assertEqual(self.out, [])

    def test_parsed_data_comes_from_db_not_from_event(self):
        sc.handle_resume_event({"resumeId": "res1", "applicantId": "a1", "skills": ["Excel"], "experienceYears": 0})
        self.assertIn("good", {m["jobRoleId"] for m in self.streams("match.computed")})  # scored with the DB profile


class ProfileAndDeleteTest(Base):
    def test_profile_updated_rescans_active_resumes_against_academic_roles_only(self):
        self.resumes["res2"] = {**ACTIVE, "resumeId": "res2", "targetStack": "other"}
        self.resumes["other"] = {**ACTIVE, "resumeId": "x", "applicantId": "a2"}
        sc.handle_profile_updated({"applicantId": "a1"})
        self.assertEqual(self.calls, [("res1", {"academic_only": True}), ("res2", {"academic_only": True})])

    def test_profile_updated_without_active_resume_does_nothing(self):
        self.resumes.clear()
        sc.handle_profile_updated({"applicantId": "a1"})
        self.assertEqual(self.out, [])

    def test_resume_deleted_rechecks_roles_the_deleted_resume_was_scanned_for(self):
        sc.scanned_role_ids = lambda rid: ["good"] if rid == "gone" else []
        sc.handle_resume_deleted({"resumeId": "gone", "applicantId": "a1"})
        self.assertEqual(self.calls, [("res1", {"role_ids": ["good"]})])

    def test_resume_deleted_falls_back_when_scan_rows_are_already_gone(self):
        sc.scanned_role_ids = lambda rid: []
        sc.handle_resume_deleted({"resumeId": "gone", "applicantId": "a1"})
        self.assertEqual(self.calls, [("res1", {})])

    def test_resume_deleted_with_no_remaining_resume_publishes_nothing(self):
        self.resumes.clear()
        sc.scanned_role_ids = lambda rid: ["good"]
        sc.handle_resume_deleted({"resumeId": "gone", "applicantId": "a1"})
        self.assertEqual(self.out, [])


class ConsumerRegistrationTest(unittest.TestCase):
    def test_streams_consumed(self):
        streams = {s for s, _, _ in sc.CONSUMERS}
        self.assertEqual(streams, {"resume.confirmed", "resume.updated", "profile.updated",
                                   "jd.extracted", "job.role.deleted", "resume.deleted"})
        self.assertNotIn("resume.parsed", streams)
        names = [n for _, n, _ in sc.CONSUMERS]
        self.assertEqual(len(names), len(set(names)))


class RoleDirectionTest(Base):
    def setUp(self):
        super().setUp()
        self.cands = [{"resumeId": "res1", "applicantId": "a1", "parsedData": RESUME},
                      {"resumeId": "res2", "applicantId": "a2", "parsedData": {"skills": ["Excel"], "experienceYears": 0}}]
        self.seen_roles = []
        sc.find_compatible_resumes_for_role = lambda role, k: (self.seen_roles.append(role), self.cands)[1]
        self.role = {"jobRoleId": "good", "title": GOOD["title"], "requirements": GOOD["requirements"], "stopped": False}
        sc.get_role = lambda rid: self.role

    def test_active_role_reports_all_candidates(self):
        sc.handle_jd_extracted({"jobPostingId": "p", "companyId": "c", "roleIds": ["good"]})
        scans = self.streams("match.scanned")[0]["scans"]
        self.assertEqual({s["applicantId"] for s in scans}, {"a1", "a2"})
        self.assertEqual([m["applicantId"] for m in self.streams("match.computed") if m["eligible"]], ["a1"])
        self.assertEqual(self.seen_roles, [self.role])             # gate gets the role (track/stacks live in requirements)

    def test_stopped_job_is_not_matched_at_all(self):
        self.role["stopped"] = True
        sc.find_compatible_resumes_for_role = lambda *a: self.fail("must not even retrieve candidates")
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

    def test_deleted_role_drops_its_vector(self):
        gone = []
        sc.delete_role_embedding = lambda rid: gone.append(rid)
        sc.handle_role_deleted({"roleId": "r9"})
        self.assertEqual(gone, ["r9"])


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