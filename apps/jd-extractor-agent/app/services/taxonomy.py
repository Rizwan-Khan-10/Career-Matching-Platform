"""Target-role taxonomy (contract §4.10). app/taxonomy/tech_roles.json is an identical copy of
resume-service/src/taxonomy/tech-roles.json; tests/test_taxonomy_copy.py fails when the copies differ."""
import json
import re
from functools import lru_cache
from pathlib import Path

TAXONOMY_PATH = Path(__file__).resolve().parent.parent / "taxonomy" / "tech_roles.json"

_TRACK_ALIASES = {
    "full_stack": "fullstack", "fullstack_developer": "fullstack",
    "data": "data_ml", "ml": "data_ml", "ai": "data_ml", "data_ml_ai": "data_ml",
    "devops": "devops_cloud", "cloud": "devops_cloud",
    "testing": "qa", "qa_testing": "qa",
}
_STACK_ALIASES = {
    ".net": "dotnet", "net": "dotnet", "c#": "dotnet", "csharp": "dotnet",
    "node": "javascript", "nodejs": "javascript", "node.js": "javascript", "typescript": "javascript", "js": "javascript",
    "golang": "go", "flutter": "cross_platform", "react_native": "cross_platform",
}


@lru_cache(maxsize=1)
def tracks() -> dict:
    """{track id: [stack ids]}"""
    data = json.loads(TAXONOMY_PATH.read_text(encoding="utf-8"))
    return {t["id"]: list(t["stacks"]) for t in data["tracks"]}


def _slug(value) -> str:
    return re.sub(r"[\s\-/]+", "_", str(value or "").strip().lower())


def clean_track(value) -> str:
    """A taxonomy track id, or 'other' when unsure / unknown (-> no gating)."""
    t = _slug(value)
    t = _TRACK_ALIASES.get(t, t)
    return t if t in tracks() else "other"


def clean_stacks(track: str, value) -> list:
    """Only stack ids that exist for this track, in order, no duplicates. Unsure / unknown -> dropped ([] = any stack)."""
    allowed = tracks().get(track, [])
    if not allowed:
        return []
    items = value.split(",") if isinstance(value, str) else (value if isinstance(value, (list, tuple)) else [])
    out = []
    for item in items:
        s = _slug(item)
        s = _STACK_ALIASES.get(s, s)
        if s in allowed and s not in out:
            out.append(s)
    return out