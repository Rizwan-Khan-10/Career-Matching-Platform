"""Fairness guard for training and evaluation (Spec 9.9: never use name, gender, photo or institution as features).

Two layers:
  1. assert_fair_features()  - fails if a feature NAME looks like a protected attribute.
  2. sanitise_resume()       - the resume handed to the feature code has no protected keys and its `education`
                               string has the institution removed (degree + field are kept).

NOTE: production (app/services/profile_text.py) still puts the full `education` string into the embedded profile text.
Training strips the institution, so the scorer never *learns* from it; to remove it from live scoring too, change
profile_text.py in all three agents (see the "Known follow-up" in training/README.md).
"""
import re

FORBIDDEN_FEATURE_TOKENS = {"name", "gender", "sex", "photo", "image", "picture", "institution", "college",
                            "university", "school", "age", "dob", "religion", "caste", "nationality", "email", "phone"}

PROTECTED_KEYS = {"name", "fullname", "firstname", "lastname", "gender", "sex", "photo", "avatarurl", "image", "dob",
                  "dateofbirth", "age", "email", "phone", "address", "linkedinurl", "nationality", "religion", "caste"}

_INSTITUTION = re.compile(r"\b(universit\w*|institut\w*|college|school|academy|iits?|iiits?|nits?|bits)\b", re.I)
_SPLIT = re.compile(r"\s*(?:,|;|\||\n|\s-\s|\s–\s|\bat\b|\bfrom\b)\s*", re.I)


def assert_fair_features(feature_names) -> None:
    bad = [n for n in feature_names if set(n.lower().split("_")) & FORBIDDEN_FEATURE_TOKENS]
    if bad:
        raise ValueError(f"protected-attribute features are not allowed: {bad}")


def strip_institution(text):
    """'B.Tech Computer Science, Indian Institute of Technology' -> 'B.Tech Computer Science'."""
    if not text:
        return text
    kept = [p.strip() for p in _SPLIT.split(str(text)) if p and p.strip() and not _INSTITUTION.search(p)]
    return ", ".join(kept) or None


def sanitise_resume(resume: dict) -> dict:
    """Copy of the parsed resume without protected keys and without the institution in `education`."""
    out = {k: v for k, v in (resume or {}).items() if k.lower() not in PROTECTED_KEYS}
    if "education" in out:
        out["education"] = strip_institution(out["education"])
    return out