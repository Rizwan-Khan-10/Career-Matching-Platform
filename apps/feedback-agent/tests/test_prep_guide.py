"""Prep guide with a stub LLM: what the model is given, and that invented dates / places / links are never passed on."""
import json
import unittest
from unittest import mock

from app.services import prep_guide

REQ = {"requiredSkills": ["Java", "Spring"], "level": "fresher"}
RESUME = {"skills": ["Java"], "projects": [{"name": "Shop"}]}
ANALYSIS = {"matchedSkills": ["Java"], "partialSkills": [], "missingSkills": ["Spring"], "score": 0.8, "reason": ""}
ROUND = {"name": "Technical round 1", "mode": "online"}


def llm(*outputs):
    """Stub for ask_llm that returns the given outputs in order and records the prompts."""
    stub = mock.Mock(side_effect=list(outputs))
    return stub


class PrepGuideTest(unittest.TestCase):
    def run_guide(self, stub, **kw):
        with mock.patch.object(prep_guide, "ask_llm", stub):
            return prep_guide.generate_prep_guide(REQ, RESUME, ANALYSIS, ROUND, kw.get("role_title", "Backend Developer"))

    def test_returns_the_guide_the_model_wrote(self):
        stub = llm(json.dumps({"guide": "  - Revise Spring Boot basics.  "}))

        self.assertEqual(self.run_guide(stub), "- Revise Spring Boot basics.")

    def test_gives_the_model_requirements_resume_match_and_round_only(self):
        stub = llm(json.dumps({"guide": "Revise Spring."}))
        self.run_guide(stub)

        system, prompt = stub.call_args[0]
        sent = json.loads(prompt)
        self.assertEqual(sent["requirements"], REQ)
        self.assertEqual(sent["resume"], RESUME)
        self.assertEqual(sent["matchAnalysis"]["missingSkills"], ["Spring"])
        self.assertEqual(sent["round"], {"name": "Technical round 1", "mode": "online"})
        self.assertEqual(sent["roleTitle"], "Backend Developer")
        self.assertIn("NEVER state or guess dates", system)
        self.assertIn("interviewer", system)

    def test_extra_round_fields_are_never_forwarded(self):
        stub = llm(json.dumps({"guide": "Revise Spring."}))
        round_info = {**ROUND, "scheduledAt": "2026-11-03T10:00:00Z", "link": "https://meet.example/x", "address": "Pune", "note": "ask for Mr Rao"}
        with mock.patch.object(prep_guide, "ask_llm", stub):
            prep_guide.generate_prep_guide(REQ, RESUME, ANALYSIS, round_info, "Dev")

        prompt = stub.call_args[0][1]
        for secret in ("2026-11-03", "meet.example", "Pune", "Mr Rao"):
            self.assertNotIn(secret, prompt)

    def test_a_guide_with_an_invented_date_is_retried_once(self):
        stub = llm(json.dumps({"guide": "Your round is on Monday at 10:30."}), json.dumps({"guide": "Revise Spring Boot basics."}))

        self.assertEqual(self.run_guide(stub), "Revise Spring Boot basics.")
        self.assertEqual(stub.call_count, 2)

    def test_gives_up_when_the_model_keeps_inventing_details(self):
        bad = json.dumps({"guide": "Join https://meet.example.com/abc on 03/11/2026."})
        stub = llm(bad, bad)

        with self.assertRaises(ValueError):
            self.run_guide(stub)
        self.assertEqual(stub.call_count, 2)

    def test_rejects_malformed_or_empty_output(self):
        with self.assertRaises(ValueError):
            self.run_guide(llm("not json"))
        with self.assertRaises(ValueError):
            self.run_guide(llm(json.dumps({"tips": "x"})))
        with self.assertRaises(ValueError):
            self.run_guide(llm(json.dumps({"guide": "   "})))


if __name__ == "__main__":
    unittest.main()
