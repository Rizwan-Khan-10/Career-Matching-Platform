import unittest

from training.train import feature_set, select_levels
from app.services.features import BASE_FEATURE_NAMES, FEATURE_NAMES


def row(level):
    req = {} if level is None else {"level": level}
    return {"role": {"requirements": req}, "label": 1}


class SelectLevelsTest(unittest.TestCase):
    def test_filter(self):
        rows = [row("fresher"), row("experienced"), row("any"), row(None)]
        self.assertEqual(len(select_levels(rows, None)), 4)
        self.assertEqual(len(select_levels(rows, [])), 4)
        self.assertEqual(len(select_levels(rows, ["fresher"])), 1)
        self.assertEqual(len(select_levels(rows, ["experienced"])), 2)       # a missing level counts as experienced
        self.assertEqual(len(select_levels(rows, ["fresher", "any"])), 2)


class FeatureSetTest(unittest.TestCase):
    def test_base_only_drops_the_fresher_columns(self):
        names, cols, nonneg = feature_set(True)
        self.assertEqual(names, BASE_FEATURE_NAMES)
        self.assertEqual(cols, list(range(len(BASE_FEATURE_NAMES))))
        self.assertEqual(len(nonneg), len(names))
        self.assertFalse(nonneg[names.index("has_req_skills")])
        self.assertTrue(nonneg[names.index("req_cov")])

    def test_all_features(self):
        names, cols, nonneg = feature_set(False)
        self.assertEqual(names, FEATURE_NAMES)
        self.assertEqual(len(cols), len(FEATURE_NAMES))
        self.assertFalse(nonneg[names.index("is_fresher_role")])


if __name__ == "__main__":
    unittest.main()
