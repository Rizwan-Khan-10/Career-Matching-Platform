"""One resume x one role -> MatchResult (score, eligible, reason, matched / partial / missing skills, breakdown).

No LLM here: features.py (semantic similarity) -> scorer.py (trained logistic model + hard gates).
Deterministic, explainable, and immune to prompt injection hidden inside a resume.
"""
from dataclasses import dataclass, field

from app.services import scorer
from app.services.features import compute_features, build_resume_side, FEATURE_NAMES  # noqa: F401  (build_resume_side is re-exported for the worker)

MATCHED_AT = 0.80   # credit >= this  -> skill counts as matched
PARTIAL_AT = 0.30   # credit >= this  -> related / partial, below -> missing


@dataclass
class MatchResult:
    score: float
    eligible: bool
    reason: str
    matchedSkills: list = field(default_factory=list)
    partialSkills: list = field(default_factory=list)
    missingSkills: list = field(default_factory=list)
    breakdown: dict = field(default_factory=dict)
    modelVersion: str = ""


def _skill_row(c: dict) -> dict:
    return {"skill": c["skill"], "credit": c["credit"], "via": c["via"],
            "matchedWith": c["matchedWith"], "similarity": c["similarity"]}


def _reason(eligible: bool, prob: float, thr: float, gates: list, matched: list, partial: list, missing: list, detail: dict) -> str:
    total = len(matched) + len(partial) + len(missing)
    if gates:
        return "Not eligible: " + "; ".join(gates) + "."
    if total == 0:
        return ("Eligible on overall profile similarity." if eligible
                else "Not eligible: the role lists no required skills and the overall profile similarity is low.")
    head = f"Covers {len(matched)} of {total} required skills"
    if partial:
        head += f" (+{len(partial)} partially)"
    if eligible:
        return head + f"; match probability {prob:.0%}."
    tail = f" Missing: {', '.join(missing[:5])}." if missing else ""
    min_exp, exp = detail.get("minExperienceYears"), detail.get("experienceYears")
    if min_exp and (exp or 0) < min_exp:
        tail += f" Experience {exp or 0:g} yrs vs {min_exp:g} yrs asked."
    return f"Not eligible: {head}; match probability {prob:.0%} is below the {thr:.0%} bar." + tail


def evaluate_match(resume: dict, role_title: str, requirements: dict, side=None) -> MatchResult:
    """`side` = build_resume_side(resume): pass it when scoring one resume against many roles (embeds the resume once)."""
    fr = compute_features(resume or {}, role_title or "", requirements or {}, side=side)
    score, eligible, prob, gates = scorer.decide(fr.features, fr.detail)

    req = fr.detail["required"]
    matched = [c["skill"] for c in req if c["credit"] >= MATCHED_AT]
    partial = [c["skill"] for c in req if PARTIAL_AT <= c["credit"] < MATCHED_AT]
    missing = [c["skill"] for c in req if c["credit"] < PARTIAL_AT]
    thr = scorer.threshold()

    return MatchResult(
        score=score, eligible=eligible,
        reason=_reason(eligible, prob, thr, gates, matched, partial, missing, fr.detail),
        matchedSkills=matched, partialSkills=partial, missingSkills=missing,
        breakdown={
            "probability": round(float(prob), 4), "threshold": thr, "gatesFailed": gates,
            "features": {k: round(float(v), 4) for k, v in fr.features.items()},
            "skills": [_skill_row(c) for c in req],
            "preferred": [_skill_row(c) for c in fr.detail["preferred"]],
            "experienceYears": fr.detail["experienceYears"], "minExperienceYears": fr.detail["minExperienceYears"],
        },
        modelVersion=scorer.model_version(),
    )