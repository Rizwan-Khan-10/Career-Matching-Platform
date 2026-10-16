"""Academic eligibility rules are kept ONLY when the document itself states them (contract §4.1: absent / null = rule
not set). The LLM is told the same, this is the safety net: a rule with no evidence in the text is dropped, because a
wrongly invented rule would silently remove real candidates."""
import re

_CGPA_WORDS = re.compile(r"cgpa|gpa|cpi|spi|percentage|percent|%|aggregate|marks|grade|academic", re.I)
_BACKLOG_WORDS = re.compile(r"backlog|back\s*log|arrear|\bkt\b|atkt|dead\s*back", re.I)
_BRANCH_STOP = {"and", "of", "the", "in", "engineering", "technology", "science", "sciences", "btech", "tech"}
_NUMBER_RE = re.compile(r"\d+(?:\.\d+)?")


def cgpa_in_text(value, text: str) -> bool:
    """A CGPA keyword is present AND a number in the text equals the value on some usual scale
    (10-point as is, percentage / 10, 4-point * 2.5, 5-point * 2)."""
    if value is None or not _CGPA_WORDS.search(text):
        return False
    for n in (float(x) for x in _NUMBER_RE.findall(text)):
        for candidate in (n, n / 10, n / 4 * 10, n / 5 * 10):
            if abs(candidate - value) < 0.06:
                return True
    return False


def backlogs_in_text(value, text: str) -> bool:
    return value is not None and bool(_BACKLOG_WORDS.search(text))


def years_in_text(years, text: str):
    """Keep only the years that really appear in the document (None when nothing is left)."""
    if not years:
        return None
    present = {int(y) for y in re.findall(r"\b(20\d{2})\b", text)}
    kept = [y for y in years if y in present]
    return kept or None


def branches_in_text(branches, text: str):
    """Keep a branch when a significant word of it ('Computer', 'Mechanical', ...) or its acronym (CSE, ECE, IT) is in
    the text. None when nothing is left."""
    if not branches:
        return None
    low, kept = text.lower(), []
    for b in branches:
        words = [w for w in re.findall(r"[a-z]+", b.lower()) if w not in _BRANCH_STOP and len(w) >= 3]
        initials = "".join(w[0] for w in re.findall(r"[A-Za-z]+", b) if w.lower() not in ("and", "of", "the", "in")).upper()
        acronyms = {initials, initials + "E"} if len(initials) >= 2 else set()
        word_hit = any(re.search(r"\b" + re.escape(w), low) for w in words)
        acr_hit = any(re.search(r"\b" + a + r"\b", text) for a in acronyms)
        if word_hit or acr_hit:
            kept.append(b)
    return kept or None


def keep_rules_found_in_text(rules: dict, text: str) -> dict:
    """rules: {minCgpa, allowedBranches, passingYears, maxBacklogs} -> same keys, unsupported ones set to None."""
    return {
        "minCgpa": rules.get("minCgpa") if cgpa_in_text(rules.get("minCgpa"), text) else None,
        "allowedBranches": branches_in_text(rules.get("allowedBranches"), text),
        "passingYears": years_in_text(rules.get("passingYears"), text),
        "maxBacklogs": rules.get("maxBacklogs") if backlogs_in_text(rules.get("maxBacklogs"), text) else None,
    }