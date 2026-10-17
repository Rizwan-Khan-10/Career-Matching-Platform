"""Tests for the training helpers (no embeddings / network needed).  EMBEDDING_BACKEND=hash python -m unittest discover -s tests -t ."""
import os
import tempfile
import unittest

os.environ.setdefault("EMBEDDING_BACKEND", "hash")
import numpy as np

from training import bounded_logreg
from training.build_real_dataset import convert, llm_parse_jd, llm_parse_resume
from training.build_aliases import build as build_aliases
from training.tech_filter import is_tech, resume_is_tech, role_is_tech, tech_skill_count
from app.services.skills import HAND_ALIASES, normalize_skill, dedupe_skills
from training.common import ranking_metrics, calibration_error


class BoundedLogregTest(unittest.TestCase):
    def test_weights_never_negative_and_constant_column_is_zero(self):
        rng = np.random.RandomState(0)
        n = 600
        good = rng.rand(n)
        bad_proxy = 1.0 - good + rng.normal(0, 0.05, n)       # anti-correlated -> plain LR would give it a negative weight
        const = np.ones(n)
        X = np.column_stack([good, bad_proxy, const])
        y = (good + rng.normal(0, 0.1, n) > 0.5).astype(int)
        coef, b = bounded_logreg.fit(X, y, C=10.0, nonneg=np.array([True, True, False]))
        self.assertTrue((coef[:2] >= -1e-9).all())
        self.assertEqual(coef[2], 0.0)
        p = bounded_logreg.predict_proba(X, coef, b)
        self.assertGreater(((p >= 0.5) == y).mean(), 0.85)


class RankingTest(unittest.TestCase):
    def test_perfect_and_worst_ranking(self):
        y, g = np.array([1, 0, 0, 1, 0, 0]), np.array(["a"] * 3 + ["b"] * 3)
        perfect = ranking_metrics(y, np.array([.9, .2, .1, .8, .3, .2]), g, k=1)
        self.assertEqual((perfect["precision@1"], perfect["ndcg@1"], perfect["mrr"]), (1.0, 1.0, 1.0))
        worst = ranking_metrics(y, np.array([.1, .9, .8, .1, .9, .8]), g, k=1)
        self.assertEqual(worst["precision@1"], 0.0)

    def test_calibration_error_zero_when_calibrated(self):
        self.assertLess(calibration_error([0, 0, 0, 0, 1, 1, 1, 1], [0.0] * 4 + [1.0] * 4), 1e-9)


class ConvertTest(unittest.TestCase):
    def test_labels_cache_and_unparseable(self):
        pairs = [{"resume": "R1", "jd": "J1", "label": "Good Fit"}, {"resume": "R1", "jd": "J2", "label": "No Fit"},
                 {"resume": "R2", "jd": "J1", "label": "Potential Fit"}, {"resume": "R3", "jd": "J3", "label": "Good Fit"}]
        calls = {"r": 0, "j": 0}

        def pr(t):
            calls["r"] += 1
            return {"skills": [t]} if t != "R3" else None

        def pj(t):
            calls["j"] += 1
            return {"title": t, "requirements": {"requiredSkills": [t]}}

        d = tempfile.mkdtemp()
        rows = convert(pairs, pr, pj, d, tech_only=False)
        self.assertEqual(sorted(r["label"] for r in rows), [0, 1])
        self.assertEqual(rows[0]["split_group"], rows[1]["split_group"])      # same resume -> same split group
        self.assertNotEqual(rows[0]["group"], rows[1]["group"])               # different jobs -> different ranking group
        before = dict(calls)
        convert(pairs, pr, pj, d, tech_only=False)
        self.assertEqual(calls, before)                                       # 2nd run is fully cached


class TechFilterTest(unittest.TestCase):
    def test_title_and_skills(self):
        self.assertTrue(is_tech("Backend Developer", ["Java", "Spring", "SQL"]))
        self.assertTrue(is_tech("Fresher", ["ReactJS", "JS", "HTML5", "CSS3"]))          # no title hint, 3+ tech skills (aliases applied)
        self.assertTrue(is_tech("QA Engineer", ["Selenium WebDriver"]))                  # tech title + 1 skill
        self.assertFalse(is_tech("Software Engineer", []))                               # title alone is not enough
        self.assertFalse(is_tech("Sales Manager", ["CRM", "Excel", "Negotiation"]))
        self.assertFalse(is_tech("Civil Engineer", ["Python", "SQL", "Git", "AutoCAD"]))  # non-tech title blocks the skills route
        self.assertEqual(tech_skill_count(["Python", "python", "PY", "Cooking"]), 1)

    def test_resume_and_role_wrappers(self):
        resume = {"currentTitle": "Fresher", "skills": ["Docker", "K8s", "Terraform"], "experience": [{"title": "DevOps Intern"}]}
        self.assertTrue(resume_is_tech(resume))
        self.assertFalse(resume_is_tech({"currentTitle": "Nurse", "skills": ["Patient care"]}))
        self.assertTrue(role_is_tech({"title": "Data Analyst", "requirements": {"requiredSkills": ["SQL"], "preferredSkills": []}}))
        self.assertFalse(role_is_tech({"title": "HR Executive", "requirements": {"requiredSkills": ["Recruitment"]}}))

    def test_convert_drops_non_tech_pairs_and_keeps_stats(self):
        pairs = [{"resume": "R1", "jd": "J1", "label": "Good Fit"}, {"resume": "R2", "jd": "J1", "label": "No Fit"},
                 {"resume": "R1", "jd": "J2", "label": "No Fit"}]
        tech_cv = {"currentTitle": "Software Engineer", "skills": ["Python", "SQL", "Git"]}
        nontech_cv = {"currentTitle": "Nurse", "skills": ["Patient care"]}
        pr = lambda t: tech_cv if t == "R1" else nontech_cv
        pj = lambda t: {"title": "Backend Developer" if t == "J1" else "Sales Manager",
                        "requirements": {"requiredSkills": ["Python", "SQL"] if t == "J1" else ["CRM"], "level": "fresher", "track": "backend"}}
        rows = convert(pairs, pr, pj, tempfile.mkdtemp())
        self.assertEqual([(r["label"], r["split_group"] == rows[0]["split_group"]) for r in rows], [(1, True)])   # only R1 x J1 survives


class ParseFieldsTest(unittest.TestCase):
    """The LLM call is faked: we only test how its JSON becomes a training row."""

    def _fake(self, payload):
        """Stand-in for app.core.llm_client (no groq package / network needed): ask_llm returns `payload`."""
        import sys
        import types
        stub = types.ModuleType("app.core.llm_client")
        stub.ask_llm = lambda *a, **k: payload
        old = sys.modules.get("app.core.llm_client")
        sys.modules["app.core.llm_client"] = stub
        self.addCleanup(lambda: sys.modules.__setitem__("app.core.llm_client", old) if old else sys.modules.pop("app.core.llm_client", None))

    def test_resume_keeps_academic_fields(self):
        import json
        self._fake(json.dumps({"skills": ["Python"], "cgpa": "8.2/10", "branch": "CSE", "passingYear": "2026", "backlogs": 0,
                               "experience": [], "projects": []}))
        r = llm_parse_resume("text")
        self.assertEqual((r["cgpa"], r["branch"], r["passingYear"], r["backlogs"]), (8.2, "CSE", 2026, 0))

    def test_resume_unknown_academic_values_stay_null(self):
        import json
        self._fake(json.dumps({"skills": ["Python"], "branch": None, "passingYear": "soon", "backlogs": None}))
        r = llm_parse_resume("text")
        self.assertEqual((r["branch"], r["passingYear"], r["backlogs"]), (None, None, None))

    def test_jd_level_track_stacks_and_rules(self):
        import json
        self._fake(json.dumps({"roles": [{"title": "Backend Dev", "requiredSkills": ["Java"], "level": "Fresher", "track": "backend",
                                          "stacks": ["java", "cobol"], "minCgpa": "60%", "allowedBranches": ["CSE", "IT"],
                                          "passingYears": [2026, "2027"], "maxBacklogs": 0}]}))
        q = llm_parse_jd("text")["requirements"]
        self.assertEqual((q["level"], q["track"], q["stacks"]), ("fresher", "backend", ["java"]))   # unknown stack id dropped
        self.assertEqual((q["minCgpa"], q["allowedBranches"], q["passingYears"], q["maxBacklogs"]), (6.0, ["CSE", "IT"], [2026, 2027], 0))

    def test_jd_rules_not_stated_are_absent_and_bad_taxonomy_is_other(self):
        import json
        self._fake(json.dumps({"roles": [{"title": "Dev", "requiredSkills": ["Java"], "level": "weird", "track": "wizard", "stacks": ["java"],
                                          "minCgpa": None, "allowedBranches": None, "passingYears": None, "maxBacklogs": None}]}))
        q = llm_parse_jd("text")["requirements"]
        self.assertEqual((q["level"], q["track"], q["stacks"]), ("any", "other", []))
        for k in ("minCgpa", "allowedBranches", "passingYears", "maxBacklogs"):
            self.assertNotIn(k, q)


class AliasTest(unittest.TestCase):
    def test_tech_aliases_normalise(self):
        cases = {".NET": "dotnet", "ASP.NET Core": "asp.net", "Spring-Boot": "spring boot", "LLMs": "large language models",
                 "Selenium WebDriver": "selenium", "PowerBI": "power bi", "GitHub Actions": "github actions", "MS SQL": "sql server",
                 "Java 8": "java", "Tensor Flow": "tensorflow", "Azure Cloud": "azure", "Docker-Compose": "docker compose", "k8s": "kubernetes"}
        for raw, canon in cases.items():
            self.assertEqual(normalize_skill(raw), canon, raw)
        self.assertEqual(dedupe_skills(["Core Java", "Java 8", "java"]), ["java"])

    def test_hand_aliases_are_applied_once_and_never_chain(self):
        for alias, canon in HAND_ALIASES.items():
            self.assertEqual(alias, alias.lower().strip(), alias)
            self.assertNotEqual(alias, canon, alias)
            self.assertNotIn(canon, HAND_ALIASES, f"{alias} -> {canon} would need a second hop")

    def test_esco_build_tech_only_and_hand_wins(self):
        header = ["preferredLabel", "altLabels"]
        rows = [{"preferredLabel": "Python (computer programming)", "altLabels": "python lang\npython scripting"},
                {"preferredLabel": "Baking bread", "altLabels": "bread making"},
                {"preferredLabel": "Kubernetes", "altLabels": "k8s\nkube"}]
        full = build_aliases(rows, header, HAND_ALIASES)
        self.assertEqual(full["bread making"], "baking bread")
        self.assertNotIn("k8s", full)                                    # hand-written alias wins, not rewritten
        tech = build_aliases(rows, header, HAND_ALIASES, keep={"python", "kubernetes"})
        self.assertEqual(tech, {"kube": "kubernetes", "python lang": "python", "python scripting": "python"})


if __name__ == "__main__":
    unittest.main()