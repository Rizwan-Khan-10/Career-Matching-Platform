"""Cheap deterministic check that generated advice does not state things nobody told the model."""
import re

_MONTHS = r"(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)"
_PATTERNS = [
    re.compile(r"https?://\S+|www\.\S+", re.I),                                   # links
    re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+"),                                      # e-mail addresses
    re.compile(r"\b\d{1,4}[/-]\d{1,2}[/-]\d{1,4}\b"),                             # 03/11/2026, 2026-11-03
    re.compile(rf"\b{_MONTHS}\.?\s+\d{{1,2}}(?:st|nd|rd|th)?\b", re.I),           # Nov 3
    re.compile(rf"\b\d{{1,2}}(?:st|nd|rd|th)?\s+(?:of\s+)?{_MONTHS}\b", re.I),    # 3rd November
    re.compile(r"\b\d{1,2}:\d{2}\b|\b\d{1,2}\s?(?:am|pm)\b", re.I),               # 10:30, 3 pm
    re.compile(r"\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b", re.I),
]


def invented_details(text: str, source: str) -> list[str]:
    """Dates, times, weekdays, links and e-mail addresses in `text` that do not appear in `source`
    (the data the model was given). An empty list means the text is clean."""
    haystack = (source or "").lower()
    found: list[str] = []
    for pattern in _PATTERNS:
        for match in pattern.finditer(text or ""):
            item = match.group(0).strip().rstrip(".,;:)")
            if item.lower() not in haystack and item not in found:
                found.append(item)
    return found
