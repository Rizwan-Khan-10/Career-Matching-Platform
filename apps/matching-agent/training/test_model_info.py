"""training/model_info.py: builds MODEL_INFO.md from a fake scorer, report and dataset. Run: python -m unittest training.test_model_info -v"""
import json
import os
import tempfile
import unittest

from training import model_info as mi


def _methods(f1, ndcg):
    base = {"accuracy": 0.8, "precision": 0.7, "recall": 0.9, "f1": f1, "roc_auc": 0.9, "ranking": {"k=3": {"ndcg@3": ndcg, "mrr": 1.0, "precision@3": 0.7}}}
    return base


def _report(version="blr-test-real10", held_n=32):
    return {
        "scorer": version, "date": "2026-10-20", "config": {"MIN_REQUIRED_SKILL_COVERAGE": 0.5, "FRESHER_PROJECT_WEIGHT": 0.3},
        "gold": {"n": 200, "eligible": 55, "roles": 20, "ece": 0.19,
                 "methods": {"A cosine-only": _methods(0.44, 0.94), "B keyword overlap": _methods(0.49, 0.99),
                             "ours: model": _methods(0.70, 0.88), "ours: full pipeline": _methods(0.80, 0.88)},
                 "by_kind": {"gold-experienced": {"n": 100, "accuracy": 0.97, "predicted_eligible": 0.26, "truly_eligible": 0.23},
                             "gold-fresher": {"n": 100, "accuracy": 0.76, "predicted_eligible": 0.54, "truly_eligible": 0.32}}},
        "held_out": {"n": held_n, "eligible": 20, "roles": 14, "ece": 0.2,
                     "methods": {"ours: full pipeline": _methods(0.41, 0.82)}, "by_kind": {}},
    }


def _scorer(version="blr-test-real10"):
    return {"version": version, "embedding_model": "all-MiniLM-L6-v2", "threshold": 0.41, "bias": -1.2,
            "weights": {"req_cov": 2.1, "global_sim": 0.5, "is_fresher_role": -0.1},
            "metrics": {"C": 1.0, "beta": 0.5, "cv_f_beta": 0.7, "n_real_pairs": 710,
                        "split": {"mode": "role+resume disjoint", "test_frac": 0.2, "seed": 7, "train": 600, "held_out": 32, "unused": 78},
                        "gold_rows_dropped_from_training": 0, "data_fingerprint": "abc123"}}


def _rows(n_fresher=2):
    rows = []
    for i in range(10):
        rows.append({"group": f"j{i % 4}", "split_group": f"r{i}", "kind": "hf_fit", "label": i % 2,
                     "role": {"requirements": {"level": "fresher" if i < n_fresher else "experienced", "track": "backend",
                                               "requiredSkills": ["Java", "SQL"], "minCgpa": 6.0 if i == 0 else None}},
                     "resume": {"branch": "IT", "passingYear": 2026, "cgpa": None}})
    return rows


class ModelInfoTest(unittest.TestCase):
    def setUp(self):
        self.d = tempfile.mkdtemp()
        self.paths = {k: os.path.join(self.d, k) for k in ("scorer.json", "real.jsonl", "MODEL_INFO.md")}
        self.reports = os.path.join(self.d, "reports")
        os.makedirs(self.reports)

    def _put(self, version="blr-test-real10", held_n=32, n_fresher=2):
        with open(self.paths["scorer.json"], "w") as f:
            json.dump(_scorer(version), f)
        with open(os.path.join(self.reports, f"eval-{version}.json"), "w") as f:
            json.dump(_report(version, held_n), f)
        with open(self.paths["real.jsonl"], "w") as f:
            f.write("\n".join(json.dumps(r) for r in _rows(n_fresher)))

    def _write(self, note="n"):
        return mi.write(note, self.paths["scorer.json"], self.reports, [self.paths["real.jsonl"]], self.paths["MODEL_INFO.md"],
                        cache_root=os.path.join(self.d, "nocache"))

    def read(self):
        return open(self.paths["MODEL_INFO.md"], encoding="utf-8").read()

    def test_writes_a_readable_file(self):
        self._put()
        self._write("first real model")
        t = self.read()
        for needle in ("## blr-test-real10", "first real model", "Gold set", "pairs: **10**", "MIN_REQUIRED_SKILL_COVERAGE = 0.5",
                       "| req_cov | +2.100 |", "recorded by `training.evaluate`"):
            self.assertIn(needle, t)

    def test_findings_are_stated(self):
        self._put(held_n=32, n_fresher=2)
        self._write()
        t = self.read()
        self.assertIn("Ranking is WEAKER", t)                    # NDCG@3 0.88 vs 0.99
        self.assertIn("Too generous for 'gold-fresher'", t)      # 54% vs 32%
        self.assertNotIn("Too generous for 'gold-experienced'", t)
        self.assertIn("held-out set has only 32 pairs", t)
        self.assertIn("Only 2 fresher roles", t)
        self.assertIn("Only 10 training pairs", t)
        self.assertIn("not well calibrated", t)

    def test_same_version_is_replaced_and_newest_is_first(self):
        self._put("v1")
        self._write("one")
        self._put("v2")
        self._write("two")
        self._put("v1")
        self._write("one again")
        t = self.read()
        self.assertEqual(t.count("<!-- run:v1 -->"), 1)
        self.assertEqual(t.count("<!-- run:v2 -->"), 1)
        self.assertLess(t.index("<!-- run:v1 -->"), t.index("<!-- run:v2 -->"))   # v1 was re-written last, so it is on top
        self.assertIn("one again", t)
        self.assertNotIn("note: one\n", t)

    def test_missing_report_is_a_clear_error(self):
        with open(self.paths["scorer.json"], "w") as f:
            json.dump(_scorer("nope"), f)
        with self.assertRaises(SystemExit) as ctx:
            self._write()
        self.assertIn("training.evaluate", str(ctx.exception))

    def test_missing_training_file_does_not_break(self):
        self._put()
        os.remove(self.paths["real.jsonl"])
        self._write()
        self.assertIn("training file not found", self.read())

    def test_cache_counts(self):
        root = os.path.join(self.d, "cache", "openai_gpt-oss-120b")
        os.makedirs(root)
        with open(os.path.join(root, "resumes.v2.jsonl"), "w") as f:
            f.write(json.dumps(["a", {"skills": []}]) + "\n" + json.dumps(["b", None, "empty"]) + "\n")
        with open(os.path.join(root, "jds.v2.jsonl"), "w") as f:
            f.write(json.dumps(["c", {"x": 1}]) + "\n")
        self.assertEqual(mi.cache_stats(os.path.join(self.d, "cache")), {"openai_gpt-oss-120b": {"resumes": 2, "jds": 1, "empty": 1}})


if __name__ == "__main__":
    unittest.main()
