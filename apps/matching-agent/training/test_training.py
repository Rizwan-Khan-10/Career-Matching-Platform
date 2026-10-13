"""Tests for the training helpers (no embeddings / network needed).  EMBEDDING_BACKEND=hash python -m unittest discover -s tests -t ."""
import os
import tempfile
import unittest

os.environ.setdefault("EMBEDDING_BACKEND", "hash")
import numpy as np

from training import bounded_logreg
from training.build_real_dataset import convert
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
        rows = convert(pairs, pr, pj, d)
        self.assertEqual(sorted(r["label"] for r in rows), [0, 1])
        self.assertEqual(rows[0]["split_group"], rows[1]["split_group"])      # same resume -> same split group
        self.assertNotEqual(rows[0]["group"], rows[1]["group"])               # different jobs -> different ranking group
        before = dict(calls)
        convert(pairs, pr, pj, d)
        self.assertEqual(calls, before)                                       # 2nd run is fully cached


if __name__ == "__main__":
    unittest.main()