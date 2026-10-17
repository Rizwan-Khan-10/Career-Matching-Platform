"""Tests for the training helpers (no embeddings / network needed).  EMBEDDING_BACKEND=hash python -m unittest discover -s tests -t ."""
import os
import tempfile
import unittest

os.environ.setdefault("EMBEDDING_BACKEND", "hash")
import numpy as np

import json

from app.services.features import FEATURE_NAMES
from training import bounded_logreg
from training.build_real_dataset import convert, llm_parse_jd, llm_parse_resume
from training.build_aliases import build as build_aliases
from training.tech_filter import is_tech, resume_is_tech, role_is_tech, tech_skill_count
from app.services.skills import HAND_ALIASES, normalize_skill, dedupe_skills
from training.common import ranking_metrics, calibration_error, split_disjoint, drop_gold_overlap, load_rows, build_matrix
from training.fairness import assert_fair_features, sanitise_resume, strip_institution
from training.train import refuse_gold

GOLD = os.path.join(os.path.dirname(os.path.abspath(__file__)), "gold", "gold_pairs.jsonl")


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
        """Stand-in for training.llm_client (no groq package / network needed): ask_llm returns `payload`."""
        import sys
        import types
        stub = types.ModuleType("training.llm_client")
        stub.ask_llm = lambda *a, **k: payload
        old = sys.modules.get("training.llm_client")
        sys.modules["training.llm_client"] = stub
        self.addCleanup(lambda: sys.modules.__setitem__("training.llm_client", old) if old else sys.modules.pop("training.llm_client", None))

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


class SplitTest(unittest.TestCase):
    def test_no_role_or_resume_on_both_sides(self):
        roles = np.array([f"jd-{i % 40}" for i in range(2000)])
        resumes = np.array([f"cv-{(i * 7) % 90}" for i in range(2000)])
        tr, te = split_disjoint(roles, resumes, 0.25, seed=3)
        self.assertGreater(te.sum(), 0)
        self.assertGreater(tr.sum(), 0)
        self.assertFalse((tr & te).any())
        self.assertFalse(set(roles[tr]) & set(roles[te]))
        self.assertFalse(set(resumes[tr]) & set(resumes[te]))
        tr2, te2 = split_disjoint(roles, resumes, 0.25, seed=3)
        self.assertTrue((tr == tr2).all() and (te == te2).all())          # deterministic

    def test_same_key_for_role_and_resume_loses_nothing(self):
        g = np.array([f"row-{i}" for i in range(500)])
        tr, te = split_disjoint(g, g, 0.2)
        self.assertEqual(tr.sum() + te.sum(), 500)


class FairnessTest(unittest.TestCase):
    def test_feature_names_are_clean(self):
        assert_fair_features(FEATURE_NAMES)
        with self.assertRaises(ValueError):
            assert_fair_features(["req_cov", "college_rank"])

    def test_sanitise_removes_institution_and_protected_keys(self):
        self.assertEqual(strip_institution("B.Tech Computer Science, Indian Institute of Technology Bombay"), "B.Tech Computer Science")
        self.assertEqual(strip_institution("Bachelor of Technology in IT from Some University"), "Bachelor of Technology in IT")
        r = sanitise_resume({"name": "A B", "gender": "f", "avatarUrl": "x", "skills": ["Java"], "education": "B.E, XYZ College of Engineering"})
        self.assertEqual(r, {"skills": ["Java"], "education": "B.E"})

    def test_institution_does_not_change_features(self):
        from app.services.features import build_resume_side, compute_features
        role = {"requiredSkills": ["Java"], "qualifications": "B.Tech"}
        a = {"skills": ["Java"], "education": "B.Tech CS, Famous University", "name": "X"}
        b = {"skills": ["Java"], "education": "B.Tech CS, Small College", "name": "Y"}
        fa = compute_features(sanitise_resume(a), "Dev", role, side=build_resume_side(sanitise_resume(a))).features
        fb = compute_features(sanitise_resume(b), "Dev", role, side=build_resume_side(sanitise_resume(b))).features
        self.assertEqual(fa, fb)


class GoldSetTest(unittest.TestCase):
    def setUp(self):
        self.rows = load_rows(GOLD)

    def test_shape(self):
        self.assertEqual(len(self.rows), 200)
        self.assertEqual({r["kind"] for r in self.rows}, {"gold-fresher", "gold-experienced"})
        self.assertEqual(len({(r["group"], r["split_group"]) for r in self.rows}), 200)
        self.assertTrue(all(r["label"] in (0, 1) for r in self.rows))
        for role in {r["group"] for r in self.rows}:
            labels = [r["label"] for r in self.rows if r["group"] == role]
            self.assertTrue(0 < sum(labels) < len(labels), role)           # every role has both classes

    def test_no_protected_data(self):
        from training.fairness import PROTECTED_KEYS
        for r in self.rows:
            self.assertFalse({k.lower() for k in r["resume"]} & PROTECTED_KEYS)
            self.assertEqual(r["resume"]["education"], strip_institution(r["resume"]["education"]))   # no institution names

    def test_training_never_sees_gold(self):
        with self.assertRaises(SystemExit):
            refuse_gold([GOLD], [])
        with self.assertRaises(SystemExit):
            refuse_gold(["x.jsonl"], self.rows[:1])
        clean, dropped = drop_gold_overlap(self.rows[:5], GOLD)
        self.assertEqual((len(clean), dropped), (0, 5))
        other = dict(self.rows[0], role=dict(self.rows[0]["role"], title="Totally different"), resume={"skills": ["Cobol"]})
        clean, dropped = drop_gold_overlap([other], GOLD)
        self.assertEqual((len(clean), dropped), (1, 0))

    def test_evaluate_runs_on_gold(self):
        import tempfile
        from training.evaluate import evaluate_set
        M = build_matrix(self.rows, cache_dir=tempfile.mkdtemp(), verbose=False)
        res = evaluate_set(M, 0.5, 0.5)
        self.assertEqual(res["n"], 200)
        self.assertEqual(set(res["methods"]), {"A cosine-only", "B keyword overlap", "ours: model", "ours: full pipeline"})
        self.assertIn("ndcg@3", res["methods"]["ours: model"]["ranking"]["k=3"])


class GroqModelTest(unittest.TestCase):
    def test_parsing_model_is_pinned(self):
        from training.groq_model import DEFAULT_MODEL
        self.assertEqual(DEFAULT_MODEL, "openai/gpt-oss-120b")
        src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "llm_client.py"), encoding="utf-8").read()
        self.assertNotIn("GROQ_MODEL\"", src.split("DEFAULT_MODEL", 1)[1])        # the env var is not read


class ModelCardTest(unittest.TestCase):
    CARD = os.path.join(os.path.dirname(os.path.abspath(__file__)), "MODEL_CARD.md")

    def test_update_is_idempotent_and_replaces_same_version(self):
        from training.update_model_card import build_row, update
        text = open(self.CARD, encoding="utf-8").read()
        sc = {"version": "blr-test-1", "embedding_model": "m", "threshold": 0.4, "metrics": {"n_real_pairs": 10}}
        rep = {"date": "2026-10-17", "gold": {"methods": {"ours: full pipeline": {"precision": 0.9, "recall": 0.8, "roc_auc": 0.95,
               "ranking": {"k=3": {"ndcg@3": 0.9, "mrr": 1.0}}}}}}
        once = update(text, build_row(sc, rep, "a | b"), "blr-test-1")
        twice = update(once, build_row(sc, rep, "again"), "blr-test-1")
        self.assertEqual(twice.count("| blr-test-1 |"), 1)
        self.assertIn("again", twice)
        self.assertIn("lr-2026-10-07-n6000", twice)             # older versions are kept

    def test_card_has_required_sections(self):
        text = open(self.CARD, encoding="utf-8").read()
        for h in ("## Data", "## Metrics", "## Known weaknesses", "## Retrain", "versions:start", "versions:end"):
            self.assertIn(h, text)


class ErrorAnalysisTest(unittest.TestCase):
    def test_every_error_has_a_hint(self):
        from training.error_analysis import analyse
        errors = analyse(load_rows(GOLD)[:40])
        for e in errors:
            self.assertIn(e["kind"], ("false positive", "false negative"))
            self.assertTrue(e["hint"])


class BackfillQueryTest(unittest.TestCase):
    def test_only_active_resumes(self):
        src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "scripts", "backfill_embeddings.py"), encoding="utf-8").read()
        self.assertIn('"confirmedAt" IS NOT NULL', src)
        self.assertIn('"supersededAt" IS NULL', src)
        self.assertNotIn("DISTINCT ON", src)


if __name__ == "__main__":
    unittest.main()