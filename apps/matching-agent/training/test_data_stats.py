import unittest

from training.data_stats import exp_bucket, summarize


def row(level, years, label):
    return {"label": label, "role": {"requirements": {"level": level}}, "resume": {"experienceYears": years}}


class DataStatsTest(unittest.TestCase):
    def test_buckets(self):
        self.assertEqual([exp_bucket(x) for x in (None, 0, 0.5, 1, 2.9, 3, 10)],
                         ["unknown", "0 yrs", "<1 yr", "1-3 yrs", "1-3 yrs", "3+ yrs", "3+ yrs"])

    def test_summary(self):
        s = summarize([row("fresher", 0, 1), row("fresher", 5, 0), row("experienced", 5, 1)])
        self.assertEqual(s["n"], 3)
        self.assertEqual(s["level"]["fresher"], 2)
        self.assertEqual(s["cross"][("fresher", "3+ yrs")], [1, 0])
        self.assertEqual(s["level_pos"]["experienced"], 1)

    def test_gold_style_row_without_requirements_wrapper(self):
        s = summarize([{"label": 1, "role": {"level": "fresher"}, "resume": {"experienceYears": 0}}])
        self.assertEqual(s["level"]["fresher"], 1)


if __name__ == "__main__":
    unittest.main()
