"""Worker behaviour with the database, Redis and the LLM faked."""
import json
import unittest
from unittest import mock

from app.workers import stream_consumer as sc

REQ = {"requiredSkills": ["Java", "Spring"], "level": "fresher", "minCgpa": 7.0, "allowedBranches": ["Computer Science"], "maxBacklogs": None}
RESUME = {"skills": ["Java"], "cgpa": 6.5, "branch": "Computer Science", "projects": [{"name": "Shop"}]}


def computed(**over):
    base = {"applicantId": "a1", "jobRoleId": "r1", "score": 0.5, "eligible": False, "reason": "CGPA 6.5 is below the required 7.0",
            "matchedSkills": ["Java"], "partialSkills": [], "missingSkills": ["Spring"], "resumeId": "res-confirmed", "unverifiedRules": ["backlogs"]}
    base.update(over)
    return base


class NotEligibleGuideTest(unittest.TestCase):
    def setUp(self):
        self.published = []
        self.llm = mock.Mock(return_value=json.dumps({"feedback": "Add a Spring project."}))
        patches = [
            mock.patch.object(sc, "get_role_requirements", return_value=REQ),
            mock.patch.object(sc, "get_applicant_resume_data", return_value=RESUME),
            mock.patch.object(sc, "get_selected_profiles", return_value=[{"skills": ["Java", "Spring"]}]),
            mock.patch.object(sc, "get_academic_profile", return_value={"academicVerified": True, "cgpa": 6.9, "branch": "Computer Science"}),
            mock.patch.object(sc, "publish", side_effect=lambda stream, data: self.published.append((stream, data))),
            mock.patch("app.services.gap_analyzer.ask_llm", self.llm),
        ]
        self.mocks = [p.start() for p in patches]
        for p in patches:
            self.addCleanup(p.stop)
        self.get_resume = self.mocks[1]

    def test_uses_the_resume_of_the_match_not_the_latest_one(self):
        sc.handle(computed())

        self.get_resume.assert_called_once_with("res-confirmed", "a1")

    def test_publishes_feedback_ready(self):
        sc.handle(computed())

        self.assertEqual(self.published, [("feedback.ready", {"applicantId": "a1", "jobRoleId": "r1", "feedback": "Add a Spring project."})])

    def test_gives_the_model_level_rules_academics_and_unverified_rules(self):
        sc.handle(computed())

        system, prompt = self.llm.call_args[0]
        sent = json.loads(prompt)
        self.assertEqual(sent["roleLevel"], "fresher")
        self.assertEqual(sent["rules"], {"minCgpa": 7.0, "allowedBranches": ["Computer Science"]})  # maxBacklogs is null = not set
        self.assertEqual(sent["matchAnalysis"]["unverifiedRules"], ["backlogs"])
        self.assertEqual(sent["matchAnalysis"]["reason"], "CGPA 6.5 is below the required 7.0")
        self.assertEqual(sent["applicantAcademics"]["cgpa"], {"value": 6.9, "source": "verified"})   # verified profile beats the resume's 6.5
        self.assertEqual(sent["applicantAcademics"]["backlogs"], {"value": None, "source": "unknown"})
        self.assertEqual(sent["applicant"], RESUME)
        self.assertIn("fresher", system)
        self.assertIn("unverifiedRules", system)

    def test_role_level_defaults_to_any(self):
        with mock.patch.object(sc, "get_role_requirements", return_value={"requiredSkills": ["Java"]}):
            sc.handle(computed())

        self.assertEqual(json.loads(self.llm.call_args[0][1])["roleLevel"], "any")

    def test_skips_eligible_low_score_and_resume_less_events(self):
        sc.handle(computed(eligible=True))
        sc.handle(computed(score=0.1))
        sc.handle(computed(resumeId=None))   # never fall back to "the latest resume"

        self.assertEqual(self.published, [])
        self.llm.assert_not_called()
        self.get_resume.assert_not_called()

    def test_skips_when_role_or_resume_is_gone(self):
        with mock.patch.object(sc, "get_role_requirements", return_value=None):
            sc.handle(computed())
        with mock.patch.object(sc, "get_applicant_resume_data", return_value={}):
            sc.handle(computed())

        self.assertEqual(self.published, [])
        self.llm.assert_not_called()


MATCH = {"applicantId": "a1", "jobRoleId": "r1", "resumeId": "res-shared", "score": 0.82, "reason": "", "matchedSkills": ["Java"],
         "partialSkills": ["SQL"], "missingSkills": ["Spring"], "unverifiedRules": [], "decision": "shortlisted"}


def shortlisted(**over):
    base = {"matchId": "m1", "applicantId": "a1", "jobRoleId": "r1", "companyId": "c1", "roleTitle": "Backend Developer", "companyName": "Acme",
            "shortlist": {"roundName": "Technical round 1", "mode": "online", "scheduledAt": "2026-11-03T10:00:00.000Z",
                          "link": "https://meet.example/x", "address": "Pune office", "bring": "ID card", "note": "Ask for Mr Rao"}}
    base.update(over)
    return base


class PrepGuideWorkerTest(unittest.TestCase):
    def setUp(self):
        self.published = []
        self.llm = mock.Mock(return_value=json.dumps({"guide": "- Revise Spring Boot basics."}))
        self.match = dict(MATCH)
        patches = {
            "get_match": mock.patch.object(sc, "get_match", side_effect=lambda _id: self.match),
            "requirements": mock.patch.object(sc, "get_role_requirements", return_value=REQ),
            "resume": mock.patch.object(sc, "get_applicant_resume_data", return_value=RESUME),
            "publish": mock.patch.object(sc, "publish", side_effect=lambda stream, data: self.published.append((stream, data))),
            "llm": mock.patch("app.services.prep_guide.ask_llm", self.llm),
        }
        self.mocks = {name: p.start() for name, p in patches.items()}
        for p in patches.values():
            self.addCleanup(p.stop)

    def test_publishes_prep_ready_with_the_guide(self):
        sc.handle_shortlisted(shortlisted())

        self.assertEqual(self.published, [("prep.ready", {"matchId": "m1", "applicantId": "a1", "jobRoleId": "r1", "guide": "- Revise Spring Boot basics."})])

    def test_uses_the_resume_stored_on_the_match(self):
        sc.handle_shortlisted(shortlisted())

        self.mocks["resume"].assert_called_once_with("res-shared", "a1")

    def test_gives_the_model_requirements_resume_matched_missing_and_round_type(self):
        sc.handle_shortlisted(shortlisted())

        sent = json.loads(self.llm.call_args[0][1])
        self.assertEqual(sent["requirements"], REQ)
        self.assertEqual(sent["resume"], RESUME)
        self.assertEqual(sent["matchAnalysis"]["matchedSkills"], ["Java"])
        self.assertEqual(sent["matchAnalysis"]["missingSkills"], ["Spring"])
        self.assertEqual(sent["round"], {"name": "Technical round 1", "mode": "online"})

    def test_company_details_never_reach_the_model(self):
        sc.handle_shortlisted(shortlisted())

        prompt = self.llm.call_args[0][1]
        for detail in ("2026-11-03", "meet.example", "Pune office", "ID card", "Mr Rao"):
            self.assertNotIn(detail, prompt)

    def test_a_model_that_invents_a_date_does_not_publish(self):
        bad = json.dumps({"guide": "The panel meets you on Monday at 10:30."})
        self.llm.return_value = bad

        with self.assertRaises(ValueError):
            sc.handle_shortlisted(shortlisted())
        self.assertEqual(self.published, [])

    def test_skips_when_the_decision_changed_meanwhile(self):
        self.match["decision"] = "rejected"
        sc.handle_shortlisted(shortlisted())
        self.match["decision"] = None
        sc.handle_shortlisted(shortlisted())

        self.assertEqual(self.published, [])
        self.llm.assert_not_called()

    def test_skips_a_missing_match_a_foreign_match_and_a_deleted_role(self):
        self.match = None
        sc.handle_shortlisted(shortlisted())
        self.match = {**MATCH, "applicantId": "someone-else"}
        sc.handle_shortlisted(shortlisted())
        self.match = dict(MATCH)
        self.mocks["requirements"].return_value = None
        sc.handle_shortlisted(shortlisted())

        self.assertEqual(self.published, [])
        self.llm.assert_not_called()

    def test_still_writes_a_guide_when_the_match_has_no_resume_row(self):
        self.match["resumeId"] = None
        sc.handle_shortlisted(shortlisted())

        self.mocks["resume"].assert_not_called()
        self.assertEqual(self.published[0][0], "prep.ready")

    def test_an_event_without_the_form_is_rejected(self):
        bad = shortlisted()
        del bad["shortlist"]

        with self.assertRaises(Exception):
            sc.handle_shortlisted(bad)


class ConsumerRegistrationTest(unittest.TestCase):
    def test_every_stream_gets_its_own_consumer_thread(self):
        started = []
        with mock.patch.object(sc.threading, "Thread", side_effect=lambda **kw: mock.Mock(start=lambda: started.append(kw["args"][0]))):
            sc.run()

        self.assertEqual(started, ["match.computed", "candidate.shortlisted", "candidate.rejected"])


if __name__ == "__main__":
    unittest.main()
