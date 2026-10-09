"""Experience maths done in CODE, not by the LLM (LLMs are unreliable at date arithmetic).

Overlapping jobs are merged so two simultaneous roles don't double-count.
"""
import re
from datetime import date

_MONTHS = {m: i for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1)}
_PRESENT = re.compile(r"\b(present|current|currently|now|till date|to date|ongoing|today|till now)\b")


def parse_month_index(value, today: date, is_end: bool = False):
    """'Jan 2020' / 'January 2020' / '01/2020' / '2020-01' / "Jan'20" / '2020' / 'Present' -> y*12+m, or None."""
    if value is None:
        return None
    t = str(value).strip().lower()
    if not t:
        return None
    if _PRESENT.search(t):
        return today.year * 12 + today.month
    m = re.search(r"\b(0?[1-9]|1[0-2])\s*[/-]\s*((?:19|20)\d{2})\b", t)           # 01/2020
    if m:
        return int(m.group(2)) * 12 + int(m.group(1))
    m = re.search(r"\b((?:19|20)\d{2})\s*[/-]\s*(0?[1-9]|1[0-2])\b", t)           # 2020-01
    if m:
        return int(m.group(1)) * 12 + int(m.group(2))
    m = re.search(r"\b([a-z]{3,9})\.?[\s,'’\-]*((?:19|20)\d{2}|\d{2})\b", t)       # Jan 2020 / Jan'20
    if m and m.group(1)[:3] in _MONTHS:
        yr = int(m.group(2))
        yr = yr + 2000 if yr < 100 else yr
        return yr * 12 + _MONTHS[m.group(1)[:3]]
    m = re.search(r"\b((?:19|20)\d{2})\b", t)                                     # bare year
    if m:
        return int(m.group(1)) * 12 + (12 if is_end else 1)
    return None


def total_experience_years(entries, today: date | None = None):
    """entries: list of dicts/objects with startDate / endDate. Returns years (1 decimal) or None if no usable dates."""
    today = today or date.today()
    now = today.year * 12 + today.month
    spans = []
    for e in entries or []:
        get = (lambda k: e.get(k)) if isinstance(e, dict) else (lambda k: getattr(e, k, None))
        s = parse_month_index(get("startDate"), today)
        en = parse_month_index(get("endDate"), today, is_end=True) if get("endDate") else now  # no end date -> still there
        if s is None or s > now:
            continue
        en = min(en if en is not None else now, now)
        if en < s:
            continue
        spans.append((s, en))
    if not spans:
        return None
    spans.sort()
    merged = [list(spans[0])]
    for s, en in spans[1:]:
        if s <= merged[-1][1] + 1:
            merged[-1][1] = max(merged[-1][1], en)
        else:
            merged.append([s, en])
    months = sum(en - s + 1 for s, en in merged)
    return round(months / 12.0, 1)