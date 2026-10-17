"""Task 2.8: campus rules (failed / passed / unknown), effective values, branch aliases, role level.

Run:  EMBEDDING_BACKEND=hash python -m unittest discover -s tests -t . -v
"""
import os
import unittest

os.environ.setdefault("EMBEDDING_BACKEND", "hash")

from app.services import rules, scorer
from app.services.features import FEATURE_NAMES, FRESHER_FEATURE_NAMES, compute_features, has_internship
from app.services.matcher import evaluate_match

RESUME = {"skills": ["ReactJS", "JavaScript", "HTML5", "CSS3", "Redux", "Git"],
          "projects": [{"name": "Shop UI", "description": "Built a storefront with React and Redux consuming REST APIs"}],
          "experienceYears": 3, "education": "B.Tech Computer Science"}
SKILLS = {"requiredSkills": ["React", "JavaScript", "HTML", "CSS", "REST API"]}


class EffectiveValueTest(unittest.TestCase):
    def test_verified_beats_resume_beats_self(self):
        profile = {"cgpa": 8.0, "academicVerified": True}
        self.assertEqual(rules.effective_value("cgpa", profile, {"cgpa": 6.0}), {"value": 8.0, "source": "verified"})
        profile = {"cgpa": 8.0, "academicVerified": False}
        self.assertEqual(rules.effective_value("cgpa", profile, {"cgpa": 6.0}), {"value": 6.0, "source": "resume"})
        self.assertEqual(rules.effective_value("cgpa", profile, {}), {"value": 8.0, "source": "self"})
        self.assertEqual(rules.effective_value("cgpa", None, None), {"value": None, "source": "unknown"})

    def test_verified_flag_with_null_value_falls_through(self):
        profile = {"cgpa": None, "academicVerified": True}
        self.assertEqual(rules.effective_value("cgpa", profile, {"cgpa": 7.2})["source"], "resume")

    def test_percentage_is_converted_to_ten_scale(self):
        self.assertEqual(rules.effective_value("cgpa", None, {"cgpa": 72})["value"], 7.2)
        self.assertEqual(rules.normalize_cgpa("8.5"), 8.5)
        self.assertIsNone(rules.normalize_cgpa("abc"))
        self.assertIsNone(rules.normalize_cgpa(-1))

    def test_junk_values_are_unknown(self):
        self.assertEqual(rules.effective_value("passingYear", None, {"passingYear": "soon"})["source"], "unknown")
        self.assertEqual(rules.effective_value("passingYear", None, {"passingYear": 12})["source"], "unknown")
        self.assertEqual(rules.effective_value("backlogs", None, {"backlogs": -2})["source"], "unknown")
        self.assertEqual(rules.effective_value("branch", None, {"branch": "  "})["source"], "unknown")
        self.assertEqual(rules.effective_value("backlogs", None, {"backlogs": 0}), {"value": 0, "source": "resume"})  # 0 is a value


class BranchAliasTest(unittest.TestCase):
    def test_cse_is_computer_science(self):
        for raw in ("CSE", "cse", "Computer Science", "Computer Science & Engineering", "B.Tech in Computer Science and Engineering",
                    "B.E. Computer Science", "Computer Science Engg."):
            self.assertEqual(rules.normalize_branch(raw), "computer science", raw)

    def test_other_aliases(self):
        self.assertEqual(rules.normalize_branch("IT"), "information technology")
        self.assertEqual(rules.normalize_branch("E&TC"), "electronics and communication")
        self.assertEqual(rules.normalize_branch("ECE"), "electronics and communication")
        self.assertEqual(rules.normalize_branch("Mechanical Engineering"), "mechanical")

    def test_different_branches_stay_different_and_junk_is_empty(self):
        self.assertNotEqual(rules.normalize_branch("Mechanical"), rules.normalize_branch("CSE"))
        self.assertEqual(rules.normalize_branch(None), "")
        self.assertEqual(rules.normalize_branch(42), "")
        self.assertEqual(rules.normalize_branch(""), "")


class RoleRulesTest(unittest.TestCase):
    def test_absent_null_or_empty_means_not_set(self):
        self.assertEqual(rules.role_rules({}), {})
        self.assertEqual(rules.role_rules(None), {})
        self.assertEqual(rules.role_rules({"minCgpa": None, "allowedBranches": [], "passingYears": [], "maxBacklogs": None}), {})
        self.assertEqual(rules.role_rules({"minCgpa": 0}), {})          # 0 asks nothing
        self.assertFalse(rules.has_academic_rules({"requiredSkills": ["x"]}))

    def test_zero_backlogs_is_a_real_rule(self):
        self.assertEqual(rules.role_rules({"maxBacklogs": 0}), {"backlogs": 0})
        self.assertTrue(rules.has_academic_rules({"maxBacklogs": 0}))

    def test_branches_are_canonicalised(self):
        self.assertEqual(rules.role_rules({"allowedBranches": ["CSE", "Computer Science", "IT"]}),
                         {"branch": ["computer science", "information technology"]})


class EvaluateRulesTest(unittest.TestCase):
    def test_passed(self):
        req = {"minCgpa": 7.0, "allowedBranches": ["Computer Science"], "passingYears": [2026, 2027], "maxBacklogs": 0}
        out = rules.evaluate_rules(req, {"cgpa": 8.1, "branch": "CSE", "passingYear": 2026, "backlogs": 0}, None)
        self.assertEqual((out.failed, out.unverified), ([], []))
        self.assertTrue(all(d["status"] == "passed" for d in out.detail.values()))

    def test_cgpa_exactly_at_minimum_passes(self):
        self.assertEqual(rules.evaluate_rules({"minCgpa": 7.0}, {"cgpa": 7.0}, None).failed, [])

    def test_each_rule_can_fail_with_a_reason(self):
        parsed = {"cgpa": 6.5, "branch": "Mechanical", "passingYear": 2025, "backlogs": 2}
        req = {"minCgpa": 7.0, "allowedBranches": ["CSE"], "passingYears": [2026], "maxBacklogs": 0}
        out = rules.evaluate_rules(req, parsed, None)
        self.assertEqual(len(out.failed), 4)
        self.assertIn("CGPA 6.5 is below the minimum 7", out.failed[0])
        self.assertTrue(any("branch Mechanical" in f for f in out.failed))
        self.assertTrue(any("passing year 2025" in f for f in out.failed))
        self.assertTrue(any("2 backlogs exceed the maximum 0" in f for f in out.failed))
        self.assertEqual(out.unverified, [])

    def test_unknown_never_fails_and_is_flagged(self):
        req = {"minCgpa": 7.0, "allowedBranches": ["CSE"], "passingYears": [2026], "maxBacklogs": 0}
        out = rules.evaluate_rules(req, {}, {})
        self.assertEqual(out.failed, [])
        self.assertEqual(out.unverified, ["cgpa", "branch", "passingYear", "backlogs"])

    def test_verified_profile_value_decides_over_resume(self):
        profile = {"cgpa": 6.0, "academicVerified": True}
        out = rules.evaluate_rules({"minCgpa": 7.0}, {"cgpa": 9.0}, profile)   # resume claims 9, admin CSV says 6
        self.assertEqual(len(out.failed), 1)
        self.assertEqual(out.detail["cgpa"]["source"], "verified")

    def test_rules_not_set_are_not_reported(self):
        out = rules.evaluate_rules({"minCgpa": 7.0}, {"cgpa": 8}, None)
        self.assertEqual(set(out.detail), {"cgpa"})

    def test_hash_part_only_for_roles_with_rules(self):
        self.assertIsNone(rules.academic_hash_part({"requiredSkills": ["x"]}, {"cgpa": 8}, None))
        a = rules.academic_hash({"minCgpa": 7}, {"cgpa": 8}, None)
        b = rules.academic_hash({"minCgpa": 7}, {"cgpa": 6}, None)
        self.assertNotEqual(a, b)
        self.assertEqual(rules.academic_hash({"minCgpa": 7}, {"cgpa": 8, "branch": "x"}, None), a)  # unused fields do not matter


class MatchGateTest(unittest.TestCase):
    def test_failed_rule_vetoes_a_strong_candidate(self):
        req = {**SKILLS, "minCgpa": 8.0}
        base = evaluate_match(RESUME, "Frontend Developer", SKILLS)
        self.assertTrue(base.eligible)                                   # skills alone are enough
        r = evaluate_match({**RESUME, "cgpa": 6.5}, "Frontend Developer", req)
        self.assertFalse(r.eligible)
        self.assertLess(r.score, scorer.threshold())
        self.assertTrue(any("CGPA 6.5" in g for g in r.breakdown["gatesFailed"]))
        self.assertIn("CGPA 6.5", r.reason)
        self.assertEqual(r.unverifiedRules, [])
        self.assertEqual(r.breakdown["rules"]["cgpa"]["status"], "failed")

    def test_passed_rule_stays_eligible(self):
        r = evaluate_match({**RESUME, "cgpa": 8.5}, "Frontend Developer", {**SKILLS, "minCgpa": 8.0})
        self.assertTrue(r.eligible)
        self.assertEqual(r.unverifiedRules, [])
        self.assertEqual(r.breakdown["rules"]["cgpa"]["status"], "passed")

    def test_unknown_value_stays_eligible_with_flag(self):
        r = evaluate_match(RESUME, "Frontend Developer", {**SKILLS, "minCgpa": 8.0, "maxBacklogs": 0})
        self.assertTrue(r.eligible)
        self.assertEqual(r.unverifiedRules, ["cgpa", "backlogs"])
        self.assertIn("CGPA, Backlogs not verified", r.reason)
        self.assertEqual(r.breakdown["gatesFailed"], [])

    def test_profile_value_is_used_when_resume_has_none(self):
        req = {**SKILLS, "minCgpa": 8.0}
        r = evaluate_match(RESUME, "Frontend Developer", req, academic={"cgpa": 6.0, "academicVerified": True})
        self.assertFalse(r.eligible)
        r = evaluate_match(RESUME, "Frontend Developer", req, academic={"cgpa": 9.0, "academicVerified": True})
        self.assertTrue(r.eligible)

    def test_cse_resume_passes_computer_science_role(self):
        req = {**SKILLS, "allowedBranches": ["Computer Science"]}
        self.assertTrue(evaluate_match({**RESUME, "branch": "CSE"}, "Frontend Developer", req).eligible)
        self.assertFalse(evaluate_match({**RESUME, "branch": "Civil Engineering"}, "Frontend Developer", req).eligible)

    def test_role_without_rules_is_unchanged(self):
        r = evaluate_match({**RESUME, "cgpa": 2.0}, "Frontend Developer", SKILLS)
        self.assertTrue(r.eligible)
        self.assertEqual((r.unverifiedRules, r.breakdown["rules"]), ([], {}))

    def test_failed_rule_and_failed_skill_gate_both_listed(self):
        req = {"requiredSkills": ["Kubernetes", "Terraform", "AWS", "Linux"], "maxBacklogs": 0}
        r = evaluate_match({**RESUME, "backlogs": 3}, "DevOps", req)
        self.assertFalse(r.eligible)
        self.assertGreaterEqual(len(r.breakdown["gatesFailed"]), 2)


class LevelTest(unittest.TestCase):
    EXP_REQ = {**SKILLS, "minExperienceYears": 8}
    JUNIOR = {**RESUME, "experienceYears": 0}

    def test_level_defaults_to_experienced(self):
        self.assertEqual(rules.normalize_level({}), "experienced")
        self.assertEqual(rules.normalize_level({"level": "weird"}), "experienced")
        self.assertEqual(rules.normalize_level({"level": " Fresher "}), "fresher")
        self.assertFalse(rules.is_fresher_level({"level": None}))

    def test_experienced_role_keeps_experience_gate(self):
        r = evaluate_match(self.JUNIOR, "Senior Frontend", {**self.EXP_REQ, "level": "experienced"})
        self.assertFalse(r.eligible)
        self.assertTrue(any("yrs experience" in g for g in r.breakdown["gatesFailed"]))
        legacy = evaluate_match(self.JUNIOR, "Senior Frontend", self.EXP_REQ)    # no level key at all
        self.assertEqual((legacy.score, legacy.reason), (r.score, r.reason))

    def test_fresher_and_any_roles_have_no_experience_gate(self):
        for level in ("fresher", "any"):
            r = evaluate_match(self.JUNIOR, "Frontend Developer", {**self.EXP_REQ, "level": level})
            self.assertTrue(r.eligible, level)
            self.assertFalse(any("experience" in g for g in r.breakdown["gatesFailed"]), level)
            self.assertNotIn("Experience", r.reason)

    def test_fresher_exp_score_is_neutral(self):
        f = compute_features(self.JUNIOR, "Dev", {**self.EXP_REQ, "level": "fresher"}).features
        self.assertEqual((f["exp_score"], f["exp_over"], f["is_fresher_role"]), (1.0, 0.0, 1.0))
        g = compute_features(self.JUNIOR, "Dev", {**self.EXP_REQ, "level": "experienced"}).features
        self.assertEqual((g["exp_score"], g["is_fresher_role"]), (0.0, 0.0))

    def test_fresher_features_are_zero_for_experienced_roles(self):
        f = compute_features(RESUME, "Dev", {**SKILLS, "level": "experienced"}).features
        self.assertEqual([f[n] for n in FRESHER_FEATURE_NAMES], [0.0, 0.0, 0.0])
        self.assertEqual(set(f), set(FEATURE_NAMES))

    def test_projects_and_internship_count_for_freshers(self):
        intern = {**self.JUNIOR, "experience": [{"title": "Frontend Intern", "description": "built UI"}]}
        f = compute_features(intern, "Dev", {**SKILLS, "level": "fresher"}).features
        self.assertEqual(f["has_internship"], 1.0)
        self.assertGreater(f["project_evidence"], 0.0)
        self.assertTrue(has_internship(intern))
        self.assertFalse(has_internship(RESUME))
        self.assertFalse(has_internship({"experience": [{"title": "Internal tools engineer"}]}))   # 'internal' is not 'intern'

    def test_fresher_score_gains_from_projects_and_internship(self):
        bare = {"skills": ["React"], "experienceYears": 0}
        rich = {**bare, "projects": [{"name": "Shop", "description": "Built a React storefront with REST APIs"}],
                "experience": [{"title": "Web Intern", "description": "React UI"}]}
        req = {"requiredSkills": ["React", "REST API"], "level": "fresher"}
        self.assertGreater(evaluate_match(rich, "Dev", req).score, evaluate_match(bare, "Dev", req).score)

    def test_experienced_score_ignores_fresher_signals(self):
        req = {"requiredSkills": ["React", "REST API"], "level": "experienced"}
        a = evaluate_match({"skills": ["React"], "experienceYears": 2}, "Dev", req)
        b = evaluate_match({"skills": ["React"], "experienceYears": 2,
                            "experience": [{"title": "Intern"}], "projects": [{"name": "x", "description": "REST API"}]}, "Dev", req)
        self.assertEqual(a.breakdown["features"]["has_internship"], b.breakdown["features"]["has_internship"])
        self.assertEqual(b.breakdown["features"]["project_evidence"], 0.0)

    def test_old_artifact_without_fresher_weights_still_loads(self):
        """scorer.json trained before 2.8 (14 base features) must keep working: extras use the interim weights."""
        import json
        import tempfile
        from app.core import config
        from app.services.features import BASE_FEATURE_NAMES
        art = {"version": "old-14", "embedding_model": None, "features": BASE_FEATURE_NAMES,
               "weights": {n: 1.0 for n in BASE_FEATURE_NAMES}, "bias": -5.0, "threshold": 0.5}
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
            json.dump(art, f)
        old_path = config.SCORER_PATH
        try:
            config.SCORER_PATH = f.name
            m = scorer.reload()
            self.assertEqual(m["version"], "old-14")                                # accepted, not replaced by defaults
            self.assertEqual(scorer.model_version(), "old-14+fresher-interim")      # hash changes once -> pairs re-score
            feats = {n: 0.5 for n in FEATURE_NAMES}
            exp_feats = {**feats, "project_evidence": 0.0, "has_internship": 0.0, "is_fresher_role": 0.0}
            self.assertGreater(scorer.probability(feats), scorer.probability(exp_feats))
            art["features"], art["weights"] = FEATURE_NAMES, {n: 0.0 for n in FEATURE_NAMES}
            with open(f.name, "w") as g:
                json.dump(art, g)
            scorer.reload()
            self.assertEqual(scorer.model_version(), "old-14")                      # artifact with own weights: no interim
            self.assertEqual(scorer.probability(feats), scorer.probability(exp_feats))
        finally:
            config.SCORER_PATH = old_path
            os.unlink(f.name)
            scorer.reload()

    def test_level_is_in_breakdown(self):
        self.assertEqual(evaluate_match(RESUME, "Dev", {**SKILLS, "level": "any"}).breakdown["level"], "any")


if __name__ == "__main__":
    unittest.main()