"""Compatibility gate (contract §4.11) + taxonomy copies. Pure logic, no DB."""
import os
import re
import unittest

os.environ.setdefault("EMBEDDING_BACKEND", "hash")

from app.services import compatibility as c  # noqa: E402
from scripts import check_taxonomy  # noqa: E402


def role(track=None, stacks=None, **extra):
    req = dict(extra)
    if track is not None:
        req["track"] = track
    if stacks is not None:
        req["stacks"] = stacks
    return req


class CompatibilityTest(unittest.TestCase):
    def test_python_resume_never_matches_java_role(self):
        self.assertFalse(c.is_compatible("backend", "python", role("backend", ["java"])))
        self.assertTrue(c.is_compatible("backend", "java", role("backend", ["java"])))

    def test_stack_list_with_several_entries(self):
        r = role("backend", ["java", "dotnet"])
        self.assertTrue(c.is_compatible("backend", "dotnet", r))
        self.assertFalse(c.is_compatible("backend", "go", r))

    def test_empty_or_missing_stacks_means_any_stack_of_the_track(self):
        self.assertTrue(c.is_compatible("backend", "python", role("backend", [])))
        self.assertTrue(c.is_compatible("backend", "python", role("backend")))
        self.assertTrue(c.is_compatible("backend", "python", {"track": "backend", "stacks": "java"}))  # garbage = not set

    def test_fullstack_bridges_frontend_and_backend(self):
        self.assertTrue(c.is_compatible("fullstack", "javascript", role("frontend", ["javascript"])))
        self.assertTrue(c.is_compatible("fullstack", "java", role("backend", ["java"])))
        self.assertTrue(c.is_compatible("frontend", "javascript", role("fullstack", ["javascript"])))
        self.assertTrue(c.is_compatible("backend", "java", role("fullstack", ["java"])))
        self.assertFalse(c.is_compatible("fullstack", "python", role("backend", ["java"])))   # bridge still checks the stack

    def test_frontend_and_backend_never_match_each_other(self):
        self.assertFalse(c.is_compatible("frontend", "javascript", role("backend", ["javascript"])))
        self.assertFalse(c.is_compatible("backend", "javascript", role("frontend", ["javascript"])))

    def test_other_tracks_do_not_bridge(self):
        self.assertFalse(c.is_compatible("mobile", "android", role("backend", [])))
        self.assertFalse(c.is_compatible("fullstack", "java", role("mobile", ["android"])))
        self.assertTrue(c.is_compatible("data_ml", "ml_ai", role("data_ml", ["ml_ai"])))
        self.assertFalse(c.is_compatible("data_ml", "ml_ai", role("data_ml", ["data_analyst"])))

    def test_other_means_no_gating(self):
        self.assertTrue(c.is_compatible("other", "other", role("backend", ["java"])))      # applicant opted out
        self.assertTrue(c.is_compatible("backend", "other", role("backend", ["java"])))
        self.assertTrue(c.is_compatible("mobile", "android", role("other")))               # role opted out
        self.assertTrue(c.is_compatible("mobile", "android", {}))                          # role without track
        self.assertTrue(c.is_compatible("mobile", "android", None))
        self.assertTrue(c.is_compatible(None, None, role("backend", ["java"])))            # unclassified legacy resume

    def test_language_tracks_exist_in_taxonomy(self):
        ids = {t["id"] for t in c.load_taxonomy()["tracks"]}
        self.assertTrue(set(c.LANGUAGE_TRACKS) <= ids)

    def test_sql_placeholders_match_the_params_vector_search_passes(self):
        names = lambda sql: set(re.findall(r"%\((\w+)\)s", sql))
        self.assertEqual(names(c.ROLE_GATE_SQL), {"r_track", "r_stack"})
        self.assertEqual(names(c.RESUME_GATE_SQL), {"role_track", "role_stacks", "has_stacks"})
        self.assertNotRegex(c.ROLE_GATE_SQL.replace("%(", ""), r"%[^(]")   # no stray % that psycopg2 would choke on
        self.assertNotRegex(c.RESUME_GATE_SQL.replace("%(", ""), r"%[^(]")

    def test_role_gate_values(self):
        self.assertEqual(c.role_gate_values(None), ("other", []))
        self.assertEqual(c.role_gate_values({"track": "backend", "stacks": ["java", 3, None]}), ("backend", ["java"]))


class TaxonomyCopiesTest(unittest.TestCase):
    def test_three_copies_are_identical(self):
        root = check_taxonomy.DEFAULT_ROOT
        if not os.path.exists(os.path.join(root, check_taxonomy.COPIES[0])):
            self.skipTest("run inside the full repository to compare the three copies")
        self.assertEqual(check_taxonomy.check(root), [])

    def test_mismatch_and_missing_are_reported(self):
        import json
        import tempfile
        with tempfile.TemporaryDirectory() as root:
            for i, rel in enumerate(check_taxonomy.COPIES):
                os.makedirs(os.path.dirname(os.path.join(root, rel)), exist_ok=True)
                doc = {"tracks": [{"id": "backend", "stacks": ["java"] if i < 2 else ["java", "go"]}]}
                if i < 3:
                    with open(os.path.join(root, rel), "w") as f:
                        json.dump(doc, f)
            problems = check_taxonomy.check(root)
            self.assertEqual(len(problems), 1)
            self.assertIn("differs", problems[0])
            os.remove(os.path.join(root, check_taxonomy.COPIES[1]))
            self.assertTrue(any(p.startswith("missing") for p in check_taxonomy.check(root)))
            self.assertEqual(check_taxonomy.main(["--root", root]), 1)


if __name__ == "__main__":
    unittest.main()