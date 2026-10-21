"""eligible / review / not_eligible, per-level thresholds, the policy key and publishing of review pairs."""
import math
import os
import unittest

os.environ.setdefault("EMBEDDING_BACKEND", "hash")

from app.core import config  # noqa: E402
from app.services import input_hash, scorer  # noqa: E402
from app.services.features import FEATURE_NAMES  # noqa: E402
from app.services.matcher import MatchResult, evaluate_match  # noqa: E402
from app.services.retrieval import best_per_applicant  # noqa: E402
from app.services.scan_report import scan_entry  # noqa: E402
from app.services.selection import select_for_publish  # noqa: E402

SETTINGS = ("ELIGIBILITY_THRESHOLD", "FRESHER_ELIGIBILITY_THRESHOLD", "REVIEW_BAND_WIDTH", "MIN_REQUIRED_SKILL_COVERAGE",
            "EXPERIENCE_GATE_RATIO", "EXPERIENCE_GATE_MIN_GAP_YEARS", "OVERQUALIFIED_EXTRA_YEARS")
FEATS = {n: 0.0 for n in FEATURE_NAMES} | {"has_req_skills": 1.0, "req_cov": 1.0}


def logit(p):
    return math.log(p / (1 - p))


class VerdictTest(unittest.TestCase):
    def setUp(self):
        self._saved = {n: getattr(config, n) for n in SETTINGS}
        self._model = scorer._model
        config.ELIGIBILITY_THRESHOLD = 0.40
        config.FRESHER_ELIGIBILITY_THRESHOLD = None
        config.REVIEW_BAND_WIDTH = 0.10

    def tearDown(self):
        for n, v in self._saved.items():
            setattr(config, n, v)
        scorer._model = self._model

    def prob(self, p):
        """a model whose probability is exactly p for every feature vector"""
        scorer._model = {"version": "t", "weights": {n: 0.0 for n in FEATURE_NAMES}, "bias": logit(p), "threshold": 0.5}

    def judge(self, p, **detail):
        self.prob(p)
        return scorer.judge(FEATS, {"level": "experienced", "experienceYears": 5, "minExperienceYears": 0, **detail})

    def test_three_bands(self):
        self.assertEqual(self.judge(0.45).verdict, "eligible")
        self.assertEqual(self.judge(0.40).verdict, "eligible")
        self.assertEqual(self.judge(0.35).verdict, "review")
        self.assertEqual(self.judge(0.30).verdict, "review")
        self.assertEqual(self.judge(0.25).verdict, "not_eligible")

    def test_eligible_flag_is_true_only_for_eligible(self):
        self.assertTrue(self.judge(0.5).eligible)
        self.assertFalse(self.judge(0.35).eligible)
        self.assertFalse(self.judge(0.1).eligible)

    def test_score_order_always_matches_verdict_order(self):
        e, r, n = self.judge(0.41), self.judge(0.399), self.judge(0.29)
        self.assertGreaterEqual(e.score, config.ELIGIBILITY_THRESHOLD)
        self.assertLess(r.score, config.ELIGIBILITY_THRESHOLD)
        self.assertGreaterEqual(r.score, 0.30)
        self.assertLess(n.score, 0.30)

    def test_hard_gate_is_never_review_and_never_scores_above_review(self):
        d = self.judge(0.9, level="experienced", experienceYears=0, minExperienceYears=5)     # experience gate
        self.assertEqual(d.verdict, "not_eligible")
        self.assertLess(d.score, 0.30)
        d = self.judge(0.35, maxExperienceYears=3)                                             # 5 yrs > company max 3
        self.assertEqual(d.verdict, "not_eligible")

    def test_extra_gates_from_campus_rules_veto(self):
        self.prob(0.9)
        d = scorer.judge(FEATS, {"level": "experienced", "experienceYears": 5}, extra_gates=["CGPA 6.0 below 7.0"])
        self.assertEqual(d.verdict, "not_eligible")
        self.assertIn("CGPA 6.0 below 7.0", d.gates)

    def test_skill_coverage_gate(self):
        self.prob(0.9)
        d = scorer.judge({**FEATS, "req_cov": 0.1}, {"level": "experienced", "experienceYears": 5})
        self.assertEqual(d.verdict, "not_eligible")

    def test_review_band_off(self):
        config.REVIEW_BAND_WIDTH = 0
        self.assertEqual(self.judge(0.35).verdict, "not_eligible")
        self.assertEqual(self.judge(0.45).verdict, "eligible")

    def test_unknown_experience_downgrades_eligible_to_review(self):
        d = self.judge(0.9, experienceYears=None, minExperienceYears=3)
        self.assertEqual((d.verdict, d.experienceUnverified), ("review", True))
        self.assertEqual(d.gates, [])
        self.assertLess(d.score, config.ELIGIBILITY_THRESHOLD)

    def test_unknown_experience_is_fine_when_the_role_does_not_ask(self):
        d = self.judge(0.9, level="fresher", experienceYears=None, minExperienceYears=0)
        self.assertEqual(d.verdict, "eligible")

    def test_fresher_has_its_own_threshold(self):
        config.FRESHER_ELIGIBILITY_THRESHOLD = 0.30
        self.assertEqual(self.judge(0.33, level="fresher").verdict, "eligible")
        self.assertEqual(self.judge(0.33, level="any").verdict, "eligible")
        self.assertEqual(self.judge(0.33, level="experienced").verdict, "review")
        self.assertEqual(self.judge(0.23, level="fresher").verdict, "review")               # band follows the fresher bar
        self.assertEqual(scorer.threshold(), 0.40)
        self.assertEqual(scorer.threshold("fresher"), 0.30)
        self.assertAlmostEqual(scorer.review_lower("fresher"), 0.20)

    def test_overqualified_is_only_a_note(self):
        d = self.judge(0.9, experienceYears=12, minExperienceYears=2)
        self.assertEqual(d.verdict, "eligible")
        self.assertIsNotNone(d.overqualified)

    def test_decide_still_returns_the_old_tuple(self):
        self.prob(0.9)
        score, eligible, prob, gates = scorer.decide(FEATS, {"level": "experienced", "experienceYears": 5})
        self.assertTrue(eligible)
        self.assertEqual(gates, [])


class PolicyKeyTest(unittest.TestCase):
    def setUp(self):
        self._saved = {n: getattr(config, n) for n in SETTINGS}
        self._model = scorer._model
        scorer._model = {"version": "t", "weights": {n: 0.0 for n in FEATURE_NAMES}, "bias": 0.0, "threshold": 0.5}

    def tearDown(self):
        for n, v in self._saved.items():
            setattr(config, n, v)
        scorer._model = self._model

    def test_changes_when_any_setting_changes(self):
        base = scorer.policy_key()
        self.assertEqual(base, scorer.policy_key())
        for name, value in (("ELIGIBILITY_THRESHOLD", 0.33), ("FRESHER_ELIGIBILITY_THRESHOLD", 0.25), ("REVIEW_BAND_WIDTH", 0.2),
                            ("MIN_REQUIRED_SKILL_COVERAGE", 0.5), ("EXPERIENCE_GATE_RATIO", 0.7), ("OVERQUALIFIED_EXTRA_YEARS", 3)):
            setattr(config, name, value)
            self.assertNotEqual(scorer.policy_key(), base, name)
            setattr(config, name, self._saved[name])
        self.assertEqual(scorer.policy_key(), base)

    def test_input_hash_depends_on_policy_but_old_hashes_stay_valid(self):
        args = ("r1", {"skills": ["a"]}, "Dev", {"requiredSkills": ["a"]}, "v1")
        plain = input_hash.compute_input_hash(*args)
        self.assertEqual(plain, input_hash.compute_input_hash(*args, policy=None))
        a = input_hash.compute_input_hash(*args, policy="t0.4")
        b = input_hash.compute_input_hash(*args, policy="t0.35")
        self.assertEqual(len({plain, a, b}), 3)


class MatchResultTest(unittest.TestCase):
    def test_verdict_defaults_from_eligible(self):
        self.assertEqual(MatchResult(0.9, True, "x").verdict, "eligible")
        self.assertEqual(MatchResult(0.1, False, "x").verdict, "not_eligible")
        self.assertEqual(MatchResult(0.35, False, "x", verdict="review").verdict, "review")

    def test_end_to_end_company_max_experience(self):
        resume = {"skills": ["React", "JavaScript"], "experienceYears": 6, "currentTitle": "Frontend Developer",
                  "experience": [{"title": "Frontend Developer", "company": "X", "startDate": "2018-01", "endDate": "2024-01"}]}
        base = {"requiredSkills": ["React", "JavaScript"], "level": "experienced", "minExperienceYears": 2}
        capped = evaluate_match(resume, "Frontend Developer", {**base, "maxExperienceYears": 4})
        self.assertEqual(capped.verdict, "not_eligible")
        self.assertIn("maximum", capped.reason)
        self.assertEqual(capped.breakdown["verdict"], "not_eligible")
        self.assertEqual(capped.breakdown["experienceRules"]["max"], 4.0)
        free = evaluate_match(resume, "Frontend Developer", base)
        self.assertNotIn("maximum", free.reason)
        self.assertIn("experienceRules", free.breakdown)


def item(eligible, score, verdict=None, applicant="a", resume="r"):
    res = type("R", (), {"eligible": eligible, "score": score, "verdict": verdict})()
    return {"result": res, "cand": {"applicantId": applicant, "resumeId": resume}}


class PublishTest(unittest.TestCase):
    def test_review_pairs_are_published_with_their_own_cap(self):
        scored = [item(True, 0.9, "eligible"), item(True, 0.5, "eligible")] + \
                 [item(False, s, "review") for s in (0.39, 0.37, 0.35, 0.33, 0.31)] + \
                 [item(False, s, "not_eligible") for s in (0.29, 0.25, 0.22, 0.1)]
        out = select_for_publish(scored, max_ineligible=2, max_review=3)
        verdicts = [o["result"].verdict for o in out]
        self.assertEqual(verdicts, ["eligible", "eligible", "review", "review", "review", "not_eligible", "not_eligible"])
        self.assertEqual([o["result"].score for o in out if o["result"].verdict == "review"], [0.39, 0.37, 0.35])

    def test_no_review_cap_when_not_given(self):
        scored = [item(False, 0.35, "review"), item(False, 0.34, "review")]
        self.assertEqual(len(select_for_publish(scored, 0)), 2)

    def test_old_results_without_verdict_still_work(self):
        scored = [item(True, 0.9), item(False, 0.3), item(False, 0.05)]
        self.assertEqual(len(select_for_publish(scored, 5)), 2)       # the 0.05 pair is below MIN_PUBLISH_SCORE

    def test_best_resume_per_applicant_prefers_eligible_then_review(self):
        scored = [item(False, 0.38, "review", "a1", "r1"), item(True, 0.41, "eligible", "a1", "r2"),
                  item(False, 0.28, "not_eligible", "a2", "r3"), item(False, 0.33, "review", "a2", "r4")]
        best = {s["cand"]["applicantId"]: s["cand"]["resumeId"] for s in best_per_applicant(scored)}
        self.assertEqual(best, {"a1": "r2", "a2": "r4"})

    def test_scan_entry_carries_the_verdict_when_there_is_one(self):
        r = type("R", (), {"eligible": False, "score": 0.35, "verdict": "review"})()
        self.assertEqual(scan_entry("role", "a", "res", r, "h")["verdict"], "review")
        r2 = type("R", (), {"eligible": True, "score": 0.5})()
        self.assertNotIn("verdict", scan_entry("role", "a", "res", r2))


if __name__ == "__main__":
    unittest.main()
