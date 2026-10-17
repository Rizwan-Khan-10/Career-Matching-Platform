"""Applicant academic values as the whole platform computes them (contract section 4.3)."""

FIELDS = ("cgpa", "branch", "passingYear", "backlogs")


def _cgpa(value):
    """CGPA scale is 10; a value above 10 is a percentage."""
    try:
        v = float(value)
    except (TypeError, ValueError):
        return None
    return round(v / 10, 2) if v > 10 else v


def effective_academics(profile: dict | None, parsed: dict | None) -> dict:
    """{field: {"value": ..., "source": "verified" | "resume" | "self" | "unknown"}} for cgpa, branch, passingYear, backlogs.

    verified (admin CSV, locked profile value) > resume (the resume being evaluated) > self (profile value) > unknown.
    """
    profile = profile or {}
    parsed = parsed or {}
    verified = bool(profile.get("academicVerified"))
    out = {}
    for field in FIELDS:
        from_profile, from_resume = profile.get(field), parsed.get(field)
        if verified and from_profile is not None:
            value, source = from_profile, "verified"
        elif from_resume is not None:
            value, source = from_resume, "resume"
        elif from_profile is not None:
            value, source = from_profile, "self"
        else:
            value, source = None, "unknown"
        if field == "cgpa" and value is not None:
            value = _cgpa(value)
            if value is None:
                source = "unknown"
        out[field] = {"value": value, "source": source}
    return out
