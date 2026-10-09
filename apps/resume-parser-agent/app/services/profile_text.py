"""Builds the *structured* text that gets embedded for a resume / a job role.

IMPORTANT: this file is copied verbatim into matching-agent, resume-parser-agent and jd-extractor-agent
(each at app/services/profile_text.py). Resume side and role side must be built the same way, otherwise
vector search compares apples with oranges. If you change it, change all three copies and
re-run scripts/backfill_embeddings.py.

The embedding model only reads ~256 tokens, so the text is ordered by importance
(title -> skills -> experience titles -> projects) and trimmed.
"""
from app.services.skills import dedupe_skills

MAX_CHARS = 1200


def _s(v) -> str:
    return str(v).strip() if v is not None else ""


def _list(v) -> list:
    return v if isinstance(v, list) else []


def resume_profile_text(p: dict) -> str:
    p = p or {}
    parts = []
    title = _s(p.get("currentTitle") or p.get("headline"))
    if title:
        parts.append(f"Candidate: {title}.")
    skills = dedupe_skills(p.get("skills"))
    if skills:
        parts.append("Skills: " + ", ".join(skills[:40]) + ".")
    exp_titles = []
    for e in _list(p.get("experience")):
        if isinstance(e, dict):
            t = _s(e.get("title"))
            d = _s(e.get("description"))[:140]
            if t:
                exp_titles.append(f"{t}" + (f" ({d})" if d else ""))
    if exp_titles:
        parts.append("Experience: " + "; ".join(exp_titles[:4]) + ".")
    if p.get("experienceYears") is not None:
        parts.append(f"{p.get('experienceYears')} years of experience.")
    projs = []
    for pr in _list(p.get("projects")):
        if isinstance(pr, dict):
            n, d = _s(pr.get("name")), _s(pr.get("description"))[:120]
            if n:
                projs.append(f"{n}" + (f": {d}" if d else ""))
    if projs:
        parts.append("Projects: " + "; ".join(projs[:4]) + ".")
    if _s(p.get("education")):
        parts.append("Education: " + _s(p.get("education")) + ".")
    return " ".join(parts)[:MAX_CHARS]


def role_profile_text(title: str, req: dict) -> str:
    req = req or {}
    parts = [f"Role: {_s(title or req.get('title'))}."]
    if _s(req.get("summary")):
        parts.append(_s(req.get("summary"))[:200])
    required = dedupe_skills(req.get("requiredSkills"))
    if required:
        parts.append("Required skills: " + ", ".join(required[:30]) + ".")
    preferred = dedupe_skills(req.get("preferredSkills"))
    if preferred:
        parts.append("Preferred skills: " + ", ".join(preferred[:15]) + ".")
    if req.get("minExperienceYears") is not None:
        parts.append(f"{req.get('minExperienceYears')}+ years of experience.")
    if _s(req.get("qualifications")):
        parts.append("Qualification: " + _s(req.get("qualifications"))[:150] + ".")
    return " ".join(parts)[:MAX_CHARS]