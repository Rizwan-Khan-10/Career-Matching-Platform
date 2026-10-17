"""Worker-level behaviour with DB/Redis faked: scan reports, stopped jobs, publish selection."""
import os
import unittest

os.environ.setdefault("EMBEDDING_BACKEND", "hash")
from tests import _shims  # noqa: E402
_shims.install()

from app.core import config  # noqa: E402
from app.services import run_stats  # noqa: E402
from app.services.scan_report import chunked, scan_entry  # noqa: E402
from app.services.side_cache import clear_caches  # noqa: E402
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
        clear_caches()
        run_stats.reset()
        sc.publish = lambda stream, data: self.out.append((stream, data))
        sc.upsert_resume_embedding = lambda *a: None
        sc.upsert_role_embedding = lambda *a: None
        sc.delete_resume_embedding = lambda *a: None
        self.profiles, self.profile_reads = {}, []             # users_service.ApplicantProfile rows by applicantId
        sc.get_academic_profile = lambda aid: (self.profile_reads.append([aid]) or self.profiles.get(aid))
        sc.get_academic_profiles = lambda ids: (self.profile_reads.append(list(ids)) or {a: self.profiles[a] for a in ids if a in self.profiles})
        self.active = True
        sc.is_role_active = lambda rid: self.active
        self.resume_active = True
        sc.is_resume_active = lambda rid: self.resume_active
        self.resumes = {"res1": ACTIVE}                       # active resumes by id
        sc.get_active_resume = lambda rid: self.resumes.get(rid)
        sc.get_active_resumes_for_applicant = lambda aid: [r for r in self.resumes.values() if r["applicantId"] == aid]
        self.calls = []                                        # (resume id, filters) of every gated retrieval (first page only)
        self.role_pool = [dict(GOOD), dict(BAD)]               # compatible roles, best similarity first
        self.stored_resume_hashes, self.stored_role_hashes = {}, {}
        sc.count_roles_for_resume = lambda resume: (10, len(self.role_pool))
        sc.count_resumes_for_role = lambda role: (10, 2)
        sc.load_scan_hashes_for_resume = lambda rid: self.stored_resume_hashes
        sc.load_scan_hashes_for_role = lambda rid: self.stored_role_hashes

        def roles(resume, vec, limit, offset=0, **filters):
            if offset == 0:
                self.calls.append((resume["resumeId"], filters))
            return self.role_pool[offset:offset + limit]
        sc.find_compatible_roles_for_resume = roles

    def streams(self, name):
        return [d for s, d in self.out if s == name]

    def last_run(self):
        return run_stats.snapshot()["recent"][0]


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


class CampusRulesWorkerTest(Base):
    """Task 2.8: campus rules are read from ApplicantProfile, gate the pair, and take part in the inputHash."""
    def setUp(self):
        super().setUp()
        self.ruled = {**GOOD, "jobRoleId": "ruled", "requirements": {**GOOD["requirements"], "minCgpa": 8.0}}
        self.role_pool = [dict(self.ruled)]

    def test_unknown_cgpa_is_published_eligible_with_unverified_flag(self):
        sc.handle_resume_event({"resumeId": "res1", "applicantId": "a1"})
        evt = self.streams("match.computed")[0]
        self.assertTrue(evt["eligible"])
        self.assertEqual(evt["unverifiedRules"], ["cgpa"])

    def test_profile_value_is_used_and_can_fail_the_pair(self):
        self.profiles["a1"] = {"cgpa": 6.0, "academicVerified": True}
        sc.handle_resume_event({"resumeId": "res1", "applicantId": "a1"})
        self.assertFalse(self.streams("match.scanned")[0]["scans"][0]["eligible"])
        evt = self.streams("match.computed")[0]                     # near miss: published, not eligible
        self.assertFalse(evt["eligible"])
        self.assertEqual(evt["unverifiedRules"], [])
        self.assertTrue(any("CGPA 6" in g for g in evt["breakdown"]["gatesFailed"]))

    def test_roles_without_rules_never_touch_the_profile_table(self):
        self.role_pool = [dict(GOOD), dict(BAD)]
        sc.handle_resume_event({"resumeId": "res1", "applicantId": "a1"})
        self.assertEqual(self.profile_reads, [])
        self.assertEqual(self.streams("match.computed")[0]["unverifiedRules"], [])

    def test_profile_is_read_once_per_run(self):
        self.role_pool = [dict(self.ruled), {**self.ruled, "jobRoleId": "ruled2"}]
        sc.handle_resume_event({"resumeId": "res1", "applicantId": "a1"})
        self.assertEqual(self.profile_reads, [["a1"]])

    def test_profile_change_rescans_the_pair_even_though_resume_and_role_are_unchanged(self):
        sc.handle_resume_event({"resumeId": "res1", "applicantId": "a1"})
        first = self.streams("match.scanned")[0]["scans"][0]
        self.stored_resume_hashes = {"ruled": (first["inputHash"], first["eligible"])}
        self.out.clear()
        sc.handle_resume_event({"resumeId": "res1", "applicantId": "a1"})
        self.assertEqual((self.out, self.last_run()["skippedByHash"]), ([], 1))   # nothing changed -> skipped
        self.profiles["a1"] = {"cgpa": 6.0, "academicVerified": True}             # admin verified a lower CGPA
        sc.handle_profile_updated({"applicantId": "a1"})
        scan = self.streams("match.scanned")[0]["scans"][0]
        self.assertNotEqual(scan["inputHash"], first["inputHash"])
        self.assertFalse(scan["eligible"])

    def test_profile_change_does_not_invalidate_roles_without_rules(self):
        self.role_pool = [dict(GOOD)]
        sc.handle_resume_event({"resumeId": "res1", "applicantId": "a1"})
        first = self.streams("match.scanned")[0]["scans"][0]
        self.stored_resume_hashes = {"good": (first["inputHash"], first["eligible"])}
        self.out.clear()
        self.profiles["a1"] = {"cgpa": 2.0, "academicVerified": True}
        sc.handle_resume_event({"resumeId": "res1", "applicantId": "a1"})
        self.assertEqual((self.out, self.last_run()["skippedByHash"]), ([], 1))

    def test_role_direction_reads_all_profiles_of_a_batch_with_one_query(self):
        cands = [{"resumeId": "res1", "applicantId": "a1", "parsedData": RESUME},
                 {"resumeId": "res2", "applicantId": "a2", "parsedData": RESUME}]
        self.profiles["a2"] = {"cgpa": 9.0, "academicVerified": True}
        sc.get_role = lambda rid: {**self.ruled, "stopped": False}
        sc.find_compatible_resumes_for_role = lambda role, vec, limit, offset=0: cands[offset:offset + limit]
        sc.handle_jd_extracted({"jobPostingId": "p", "companyId": "c", "roleIds": ["ruled"]})
        self.assertEqual(self.profile_reads, [["a1", "a2"]])
        by_app = {m["applicantId"]: m for m in self.streams("match.computed")}
        self.assertEqual(by_app["a1"]["unverifiedRules"], ["cgpa"])   # no profile row -> unknown
        self.assertEqual(by_app["a2"]["unverifiedRules"], [])         # verified 9.0 >= 8.0

    def test_role_without_rules_reads_no_profiles(self):
        sc.get_role = lambda rid: {"jobRoleId": "good", "title": GOOD["title"], "requirements": GOOD["requirements"], "stopped": False}
        sc.find_compatible_resumes_for_role = lambda role, vec, limit, offset=0: [{"resumeId": "res1", "applicantId": "a1", "parsedData": RESUME}][offset:offset + limit]
        sc.handle_jd_extracted({"jobPostingId": "p", "companyId": "c", "roleIds": ["good"]})
        self.assertEqual(self.profile_reads, [])


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

        def cands(role, vec, limit, offset=0):
            if offset == 0:
                self.seen_roles.append(role)
            return self.cands[offset:offset + limit]
        sc.find_compatible_resumes_for_role = cands
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


class HashSkipTest(Base):
    def first_run_hashes(self):
        sc.handle_resume_event({"resumeId": "res1", "applicantId": "a1"})
        scans = {x["jobRoleId"]: x for x in self.streams("match.scanned")[0]["scans"]}
        self.assertTrue(all(x["inputHash"] for x in scans.values()))
        return {rid: (x["inputHash"], x["eligible"]) for rid, x in scans.items()}

    def test_unchanged_pairs_are_not_scored_or_published_again(self):
        self.stored_resume_hashes = self.first_run_hashes()
        self.out.clear()
        sc.handle_resume_event({"resumeId": "res1", "applicantId": "a1"})          # same event again
        self.assertEqual(self.out, [])
        run = self.last_run()
        self.assertEqual((run["skippedByHash"], run["scored"]), (2, 0))

    def test_edited_resume_is_scored_again(self):
        self.stored_resume_hashes = self.first_run_hashes()
        self.out.clear()
        self.resumes["res1"] = {**ACTIVE, "parsedData": {**RESUME, "skills": RESUME["skills"] + ["Vue"]}}
        sc.handle_resume_event({"resumeId": "res1", "applicantId": "a1"})
        self.assertEqual(self.last_run()["scored"], 2)
        self.assertTrue(self.streams("match.scanned"))

    def test_edited_role_is_scored_again_but_other_pairs_stay_skipped(self):
        self.stored_resume_hashes = self.first_run_hashes()
        self.out.clear()
        self.role_pool[0] = {**GOOD, "requirements": {**GOOD["requirements"], "minExperienceYears": 1}}
        sc.handle_resume_event({"resumeId": "res1", "applicantId": "a1"})
        run = self.last_run()
        self.assertEqual((run["scored"], run["skippedByHash"]), (1, 1))
        self.assertEqual([x["jobRoleId"] for x in self.streams("match.scanned")[0]["scans"]], ["good"])

    def test_model_change_invalidates_the_hash(self):
        self.stored_resume_hashes = self.first_run_hashes()
        self.out.clear()
        real, sc.scorer.model_version = sc.scorer.model_version, lambda: "another-model"
        try:
            sc.handle_resume_event({"resumeId": "res1", "applicantId": "a1"})
        finally:
            sc.scorer.model_version = real
        self.assertEqual(self.last_run()["scored"], 2)

    def test_resume_deleted_ignores_hashes_so_lost_matches_come_back(self):
        self.stored_resume_hashes = self.first_run_hashes()
        self.out.clear()
        sc.scanned_role_ids = lambda rid: []
        sc.handle_resume_deleted({"resumeId": "gone", "applicantId": "a1"})
        self.assertEqual(self.last_run()["skippedByHash"], 0)
        self.assertIn("good", {m["jobRoleId"] for m in self.streams("match.computed")})

    def test_role_direction_skips_unchanged_pairs(self):
        sc.get_role = lambda rid: {"jobRoleId": "good", "title": GOOD["title"], "requirements": GOOD["requirements"], "stopped": False}
        sc.find_compatible_resumes_for_role = lambda role, vec, limit, offset=0: [{"resumeId": "res1", "applicantId": "a1", "parsedData": RESUME}][offset:offset + limit]
        sc.handle_jd_extracted({"jobPostingId": "p", "companyId": "c", "roleIds": ["good"]})
        scan = self.streams("match.scanned")[0]["scans"][0]
        self.stored_role_hashes = {"res1": (scan["inputHash"], scan["eligible"])}
        self.out.clear()
        sc.handle_jd_extracted({"jobPostingId": "p", "companyId": "c", "roleIds": ["good"]})
        self.assertEqual(self.out, [])
        self.assertEqual(self.last_run()["skippedByHash"], 1)


class EarlyStopInWorkerTest(Base):
    def test_hopeless_tail_is_not_scored(self):
        old = config.BATCH_SIZE
        config.BATCH_SIZE = 10
        try:
            self.role_pool = [{**BAD, "jobRoleId": f"bad{i}"} for i in range(100)]
            sc.handle_resume_event({"resumeId": "res1", "applicantId": "a1"})
        finally:
            config.BATCH_SIZE = old
        run = self.last_run()
        self.assertEqual((run["retrieved"], run["scored"], run["stoppedBy"]), (20, 20, "empty_batches"))

    def test_gate_count_is_reported(self):
        sc.count_roles_for_resume = lambda resume: (40, 12)
        sc.handle_resume_event({"resumeId": "res1", "applicantId": "a1"})
        self.assertEqual(self.last_run()["gatedOut"], 28)


class BestResumePerApplicantWorkerTest(Base):
    def test_only_the_best_resume_of_an_applicant_is_published_but_all_are_scanned(self):
        weak = {"skills": ["React", "JavaScript"], "experienceYears": 3}
        sc.get_role = lambda rid: {"jobRoleId": "good", "title": GOOD["title"], "requirements": GOOD["requirements"], "stopped": False}
        cands = [{"resumeId": "weak", "applicantId": "a1", "parsedData": weak},
                 {"resumeId": "strong", "applicantId": "a1", "parsedData": RESUME}]
        sc.find_compatible_resumes_for_role = lambda role, vec, limit, offset=0: cands[offset:offset + limit]
        sc.handle_jd_extracted({"jobPostingId": "p", "companyId": "c", "roleIds": ["good"]})
        self.assertEqual({x["resumeId"] for x in self.streams("match.scanned")[0]["scans"]}, {"weak", "strong"})
        self.assertEqual([m["resumeId"] for m in self.streams("match.computed")], ["strong"])


class ScanReportTest(unittest.TestCase):
    def test_chunking(self):
        sizes = [len(c) for c in chunked(list(range(450)), 200)]
        self.assertEqual(sizes, [200, 200, 50])
        self.assertEqual(list(chunked([], 200)), [])

    def test_entry_shape(self):
        r = type("R", (), {"eligible": 1, "score": 0.5})()
        self.assertEqual(scan_entry("r", "a", None, r), {"jobRoleId": "r", "applicantId": "a", "resumeId": None, "eligible": True, "score": 0.5, "inputHash": None})


if __name__ == "__main__":
    unittest.main()