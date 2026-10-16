"""The taxonomy JSON must be identical in resume-service (source of truth), jd-extractor-agent and matching-agent
(contract §4.10); role_profile_text must be the same builder as matching-agent's."""
import json
import unittest
from pathlib import Path

APPS = Path(__file__).resolve().parents[2]
MINE = Path(__file__).resolve().parents[1] / "app" / "taxonomy" / "tech_roles.json"
OTHER_COPIES = {
    "resume-service": APPS / "resume-service" / "src" / "taxonomy" / "tech-roles.json",
    "matching-agent": APPS / "matching-agent" / "app" / "taxonomy" / "tech_roles.json",
}
MY_PROFILE_TEXT = Path(__file__).resolve().parents[1] / "app" / "services" / "profile_text.py"
MATCHING_PROFILE_TEXT = APPS / "matching-agent" / "app" / "services" / "profile_text.py"


def load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


class TaxonomyCopyTest(unittest.TestCase):
    def test_copy_is_present_and_well_formed(self):
        data = load(MINE)
        ids = [t["id"] for t in data["tracks"]]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertEqual(next(t for t in data["tracks"] if t["id"] == "other")["stacks"], [])

    def test_copies_are_identical(self):
        mine, checked = load(MINE), 0
        for name, path in OTHER_COPIES.items():
            if path.exists():
                checked += 1
                with self.subTest(copy=name):
                    self.assertEqual(load(path), mine, f"{name} taxonomy differs from jd-extractor-agent")
        if not checked:
            self.skipTest("no other taxonomy copy found (running outside the monorepo?)")

    @unittest.skipUnless(MATCHING_PROFILE_TEXT.exists(), "matching-agent not present")
    def test_profile_text_builder_is_the_same_as_matching_agent(self):
        self.assertEqual(MY_PROFILE_TEXT.read_text(encoding="utf-8"), MATCHING_PROFILE_TEXT.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()