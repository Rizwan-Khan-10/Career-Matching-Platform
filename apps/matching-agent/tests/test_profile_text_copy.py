"""profile_text.py must be the same builder as in jd-extractor-agent (embedding text of both sides must match).
The taxonomy copies are already checked in test_compatibility.py via scripts/check_taxonomy.py."""
import unittest
from pathlib import Path

APPS = Path(__file__).resolve().parents[2]
MINE = Path(__file__).resolve().parents[1] / "app" / "services" / "profile_text.py"
JD = APPS / "jd-extractor-agent" / "app" / "services" / "profile_text.py"


class ProfileTextCopyTest(unittest.TestCase):
    @unittest.skipUnless(JD.exists(), "jd-extractor-agent not present")
    def test_profile_text_builder_is_the_same_as_jd_extractor(self):
        self.assertEqual(MINE.read_text(encoding="utf-8"), JD.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()