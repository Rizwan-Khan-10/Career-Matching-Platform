"""Pure helpers: effective academic values (contract 4.3) and the 'no invented details' check."""
import unittest

from app.services.academics import effective_academics
from app.services.safety import invented_details


class EffectiveAcademicsTest(unittest.TestCase):
    def test_verified_profile_value_beats_the_resume(self):
        out = effective_academics({"academicVerified": True, "cgpa": 8.1, "branch": "CSE"}, {"cgpa": 9.5, "branch": "IT"})

        self.assertEqual(out["cgpa"], {"value": 8.1, "source": "verified"})
        self.assertEqual(out["branch"], {"value": "CSE", "source": "verified"})

    def test_resume_beats_a_self_entered_value(self):
        out = effective_academics({"academicVerified": False, "cgpa": 7.0}, {"cgpa": 8.2})

        self.assertEqual(out["cgpa"], {"value": 8.2, "source": "resume"})

    def test_self_value_is_used_when_the_resume_has_none(self):
        out = effective_academics({"branch": "ECE"}, {"branch": None})

        self.assertEqual(out["branch"], {"value": "ECE", "source": "self"})

    def test_verified_flag_without_a_value_falls_through(self):
        out = effective_academics({"academicVerified": True, "passingYear": None}, {"passingYear": 2026})

        self.assertEqual(out["passingYear"], {"value": 2026, "source": "resume"})

    def test_unknown_when_nobody_has_the_value(self):
        out = effective_academics({}, {})

        for field in ("cgpa", "branch", "passingYear", "backlogs"):
            self.assertEqual(out[field], {"value": None, "source": "unknown"})

    def test_zero_backlogs_is_a_value_not_a_missing_value(self):
        self.assertEqual(effective_academics({}, {"backlogs": 0})["backlogs"], {"value": 0, "source": "resume"})

    def test_cgpa_above_ten_is_a_percentage(self):
        self.assertEqual(effective_academics({}, {"cgpa": 78})["cgpa"]["value"], 7.8)

    def test_handles_missing_dicts(self):
        self.assertEqual(effective_academics(None, None)["cgpa"]["source"], "unknown")


class InventedDetailsTest(unittest.TestCase):
    def test_plain_advice_is_clean(self):
        text = "Revise SQL joins and indexing.\n- Prepare two stories from your Shop project.\n- Practise 5 mock questions on REST design (Python 3.11)."

        self.assertEqual(invented_details(text, "{}"), [])

    def test_flags_dates_times_weekdays_links_and_emails(self):
        for text in (
            "Your interview is on 03/11/2026.", "It starts at 10:30.", "Be there by 3 pm.", "Come on Monday.",
            "Join at https://meet.example.com/abc", "Write to hr@acme.com", "See you on Nov 3rd.", "On 3rd November, bring ID.",
        ):
            self.assertNotEqual(invented_details(text, "{}"), [], text)

    def test_allows_a_detail_that_is_part_of_the_input(self):
        self.assertEqual(invented_details("Read https://docs.example.com first.", '{"resume": "see https://docs.example.com"}'), [])

    def test_returns_each_problem_once(self):
        self.assertEqual(invented_details("Monday, again Monday.", ""), ["Monday"])


if __name__ == "__main__":
    unittest.main()
