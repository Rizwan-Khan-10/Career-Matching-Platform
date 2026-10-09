import re


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