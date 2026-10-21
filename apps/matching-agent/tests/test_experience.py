import os
import unittest

os.environ.setdefault("EMBEDDING_BACKEND", "hash")

from app.core import config  # noqa: E402
from app.services import experience  # noqa: E402


class RoleRulesTest(unittest.TestCase):
    def test_defaults_mean_no_upper_limit(self):
        self.assertEqual(experience.role_rules({}), {"min": 0.0, "max": None, "strict": False})
        self.assertEqual(experience.role_rules(None), {"min": 0.0, "max": None, "strict": False})

    def test_values_are_read(self):
        r = experience.role_rules({"minExperienceYears": 2, "maxExperienceYears": 4, "strictMinExperience": True})
        self.assertEqual(r, {"min": 2.0, "max": 4.0, "strict": True})

    def test_max_below_min_is_ignored(self):
        self.assertIsNone(experience.role_rules({"minExperienceYears": 5, "maxExperienceYears": 2})["max"])

    def test_junk_values_are_ignored(self):
        r = experience.role_rules({"minExperienceYears": "abc", "maxExperienceYears": -3, "strictMinExperience": "yes"})
        self.assertEqual(r, {"min": 0.0, "max": None, "strict": False})


class CheckTest(unittest.TestCase):
    def test_above_company_max_is_a_gate_for_every_level(self):
        for level in ("fresher", "experienced", "any"):
            c = experience.check(level, 5, 0, 3)
            self.assertEqual(len(c.gates), 1, level)
            self.assertIn("maximum", c.gates[0])
        self.assertEqual(experience.check("experienced", 3, 0, 3).gates, [])      # exactly at the max is fine

    def test_no_max_means_no_upper_gate_even_for_fresher(self):
        self.assertEqual(experience.check("fresher", 9, 0, None).gates, [])

    def test_strict_min_rejects_any_shortfall(self):
        self.assertEqual(len(experience.check("experienced", 1.5, 2, None, strict=True).gates), 1)
        self.assertEqual(experience.check("experienced", 2, 2, None, strict=True).gates, [])
        self.assertEqual(len(experience.check("fresher", 1, 2, None, strict=True).gates), 1)

    def test_soft_min_only_rejects_big_shortfall_of_experienced_roles(self):
        # ratio 0.5, gap >= 1: 4 yrs vs 5 is fine, 0 vs 5 is a gate
        self.assertEqual(experience.check("experienced", 4, 5).gates, [])
        self.assertEqual(len(experience.check("experienced", 0, 5).gates), 1)
        self.assertEqual(experience.check("fresher", 0, 5).gates, [])
        self.assertEqual(experience.check("any", 0, 5).gates, [])
        self.assertEqual(experience.check(None, 0, 5).gates and 1, 1)              # missing level = experienced

    def test_unknown_experience_never_rejects(self):
        c = experience.check("experienced", None, 5, 8, strict=True)
        self.assertEqual(c.gates, [])
        self.assertTrue(c.unverified)

    def test_unknown_experience_is_not_flagged_when_the_role_does_not_ask(self):
        self.assertFalse(experience.check("fresher", None, 0, None).unverified)
        self.assertTrue(experience.check("fresher", None, 0, 1).unverified)         # a max makes experience matter

    def test_overqualified_note_only_without_max(self):
        old = config.OVERQUALIFIED_EXTRA_YEARS
        try:
            config.OVERQUALIFIED_EXTRA_YEARS = 5
            self.assertIsNotNone(experience.check("experienced", 8, 2).overqualified)         # 8 > 2 + 5
            self.assertIsNone(experience.check("experienced", 7, 2).overqualified)            # 7 == 2 + 5 -> not more than
            self.assertIsNone(experience.check("experienced", 8, 2, 10).overqualified)        # company set a max
            self.assertIsNone(experience.check("fresher", 8, 0).overqualified)                # no minimum
            self.assertEqual(experience.check("experienced", 8, 2).gates, [])                 # never a gate
        finally:
            config.OVERQUALIFIED_EXTRA_YEARS = old


if __name__ == "__main__":
    unittest.main()
