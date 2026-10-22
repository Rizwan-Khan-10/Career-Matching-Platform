import unittest
from datetime import date
from app.services.experience import is_internship, parse_month_index, total_experience_years

TODAY = date(2026, 10, 4)


class ExperienceTest(unittest.TestCase):
    def test_date_formats(self):
        idx = lambda s, **k: parse_month_index(s, TODAY, **k)
        self.assertEqual(idx("Jan 2020"), 2020 * 12 + 1)
        self.assertEqual(idx("January 2020"), 2020 * 12 + 1)
        self.assertEqual(idx("03/2021"), 2021 * 12 + 3)
        self.assertEqual(idx("2021-07"), 2021 * 12 + 7)
        self.assertEqual(idx("Sept'19"), 2019 * 12 + 9)
        self.assertEqual(idx("2018"), 2018 * 12 + 1)
        self.assertEqual(idx("2018", is_end=True), 2018 * 12 + 12)
        self.assertEqual(idx("Present"), 2026 * 12 + 10)
        self.assertEqual(idx("till date"), 2026 * 12 + 10)
        self.assertIsNone(idx("garbage"))
        self.assertIsNone(idx(None))

    def test_simple_and_present(self):
        self.assertEqual(total_experience_years([{"startDate": "Jan 2020", "endDate": "Dec 2020"}], TODAY), 1.0)
        # Oct 2024 .. Oct 2026 inclusive = 25 months
        self.assertEqual(total_experience_years([{"startDate": "Oct 2024", "endDate": "Present"}], TODAY), 2.1)

    def test_overlap_is_not_double_counted(self):
        e = [{"startDate": "Jan 2020", "endDate": "Dec 2020"}, {"startDate": "Jun 2020", "endDate": "Dec 2021"}]
        self.assertEqual(total_experience_years(e, TODAY), 2.0)   # Jan2020-Dec2021 = 24 months

    def test_gaps_and_bad_rows(self):
        e = [{"startDate": "Jan 2018", "endDate": "Jun 2018"}, {"startDate": "Jan 2020", "endDate": "Jun 2020"},
             {"startDate": "???", "endDate": "???"}, {"startDate": "Jan 2030", "endDate": "Present"},
             {"startDate": "Dec 2022", "endDate": "Jan 2022"}]
        self.assertEqual(total_experience_years(e, TODAY), 1.0)

    def test_no_usable_dates(self):
        self.assertIsNone(total_experience_years([], TODAY))
        self.assertIsNone(total_experience_years([{"startDate": None, "endDate": None}], TODAY))

    def test_internships_are_not_work_experience(self):
        e = [{"title": "Software Intern", "startDate": "Jan 2023", "endDate": "Jun 2023"},
             {"title": "Backend Developer", "company": "Acme", "startDate": "Jan 2024", "endDate": "Dec 2024"}]
        self.assertEqual(total_experience_years(e, TODAY), 1.0)                                   # only the job
        self.assertEqual(total_experience_years(e, TODAY, exclude_internships=False), 1.5)

    def test_only_internships_means_zero_years(self):
        e = [{"title": "Data Science Intern", "startDate": "Jan 2024", "endDate": "Jun 2024"},
             {"title": "Trainee Engineer", "startDate": "Jul 2024", "endDate": "Dec 2024"}]
        self.assertEqual(total_experience_years(e, TODAY), 0.0)

    def test_internship_without_dates_is_still_none(self):
        self.assertIsNone(total_experience_years([{"title": "Intern"}], TODAY))

    def test_word_boundaries(self):
        self.assertFalse(is_internship({"title": "International Sales Lead"}))
        self.assertTrue(is_internship({"title": "Intern - Backend"}))


if __name__ == "__main__":
    unittest.main()