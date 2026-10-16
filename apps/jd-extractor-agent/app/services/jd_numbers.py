import re

_YEAR_RE = re.compile(r"\b(?:19|20)\d{2}\b")
_RANGE_RE = re.compile(r"\b((?:19|20)\d{2})\s*(?:-|–|—|to)\s*((?:19|20)\d{2})\b")
_ANY_BRANCH_RE = re.compile(r"^(any|all|open to all|no restriction|not specified|n/?a|null|none)\b", re.I)


def _num(v):
    if v is None or isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    m = re.search(r"-?\d+(?:\.\d+)?", str(v))
    return float(m.group()) if m else None


def coerce_min_years(v):
    """'2-4 years' -> 2, '3+' -> 3, 'fresher'/'entry level' -> 0, None -> None."""
    if v is None or isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return float(v) if 0 <= v <= 40 else None
    s = str(v).lower()
    m = re.search(r"\d+(?:\.\d+)?", s)
    if m:
        n = float(m.group())
        return n if 0 <= n <= 40 else None
    if re.search(r"fresher|entry|graduate|no experience|intern", s):
        return 0.0
    return None


def coerce_cgpa(v):
    """Minimum CGPA on the 10-point scale (contract §4.3): '7.5' -> 7.5, '7/10' -> 7.0, '3.0/4' -> 7.5,
    '60%' or 60 -> 6.0. Unusable (0, > 100, nonsense) -> None."""
    if v is None or isinstance(v, bool):
        return None
    m = re.search(r"(\d+(?:\.\d+)?)\s*/\s*(\d+(?:\.\d+)?)", str(v))
    if m and float(m.group(2)) > 0:
        n = float(m.group(1)) / float(m.group(2)) * 10
    else:
        n = _num(v)
        if n is not None and n > 10:
            n = n / 10 if n <= 100 else None   # above 10 = percentage
    return round(n, 2) if n is not None and 0 < n <= 10 else None


def coerce_backlogs(v):
    """Whole number 0-20, else None. Missing is NOT 0: only an explicit number counts."""
    n = _num(v)
    if n is None or n < 0 or n > 20 or n != int(n):
        return None
    return int(n)


def coerce_passing_years(v):
    """[2026, '2027'] / '2026 and 2027' / '2025-2027' -> sorted unique years in 2000-2050, else None (rule not set)."""
    if v is None or isinstance(v, bool):
        return None
    items = v if isinstance(v, (list, tuple)) else [v]
    years = set()
    for item in items:
        if item is None or isinstance(item, bool):
            continue
        s = str(item)
        m = _RANGE_RE.search(s)
        if m and 0 <= int(m.group(2)) - int(m.group(1)) <= 6:
            years.update(range(int(m.group(1)), int(m.group(2)) + 1))
        else:
            years.update(int(y) for y in _YEAR_RE.findall(s))
    years = sorted(y for y in years if 2000 <= y <= 2050)
    return years or None


def clean_branches(v):
    """'CSE, IT' or ['Computer Science', 'IT'] -> cleaned list; 'Any branch' / empty -> None (rule not set)."""
    if v is None or isinstance(v, bool):
        return None
    items = re.split(r"[,;/|\n]", v) if isinstance(v, str) else (v if isinstance(v, (list, tuple)) else [v])
    out, seen = [], set()
    for item in items:
        s = re.sub(r"\s+", " ", str(item or "")).strip(" \t.,;:|•·-–—*")
        if not s or len(s) > 80 or _ANY_BRANCH_RE.match(s) or s.lower() in seen:
            continue
        seen.add(s.lower())
        out.append(s)
    return out[:15] or None


def coerce_level(v):
    """-> 'fresher' | 'experienced' | 'any'. Anything unclear (or both words present) -> 'any' (= no level rule)."""
    s = str(v or "").strip().lower()
    if s in ("fresher", "experienced", "any"):
        return s
    fresher = bool(re.search(r"fresh|entry|graduate|campus|trainee|intern", s))
    experienced = bool(re.search(r"experienc|senior|lead|\bmid\b|\bsr\b", s))
    if fresher and not experienced:
        return "fresher"
    if experienced and not fresher:
        return "experienced"
    return "any"