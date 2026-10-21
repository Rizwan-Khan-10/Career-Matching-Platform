"""One resume x one role -> MatchResult (score, eligible, verdict, reason, matched / partial / missing skills, breakdown).

No LLM here: features.py (semantic similarity) -> scorer.py (trained logistic model + hard gates).
Deterministic, explainable, and immune to prompt injection hidden inside a resume.
"""
from dataclasses import dataclass, field

from app.services import experience, rules, scorer
from app.services.features import compute_features, build_resume_side, build_role_side, FEATURE_NAMES  # noqa: F401  (re-exported for the worker / caches)

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
    unverifiedRules: list = field(default_factory=list)   # names among cgpa, branch, passingYear, backlogs (contract 6)
    verdict: str | None = None   # eligible | review | not_eligible; None -> derived from `eligible` (last field: positional callers keep working)

    def __post_init__(self):
        if self.verdict is None:
            self.verdict = "eligible" if self.eligible else "not_eligible"


def _skill_row(c: dict) -> dict:
    return {"skill": c["skill"], "credit": c["credit"], "via": c["via"],
            "matchedWith": c["matchedWith"], "similarity": c["similarity"]}


def _reason(verdict: str, prob: float, thr: float, gates: list, matched: list, partial: list, missing: list, detail: dict,
            unverified: list | None = None, experience_unverified: bool = False) -> str:
    note = rules.unverified_note(unverified or [])
    suffix = f" {note}." if note else ""        # e.g. " CGPA not verified." -> shown to applicant and company
    eligible = verdict == "eligible"
    total = len(matched) + len(partial) + len(missing)
    if gates:
        return "Not eligible: " + "; ".join(gates) + "." + suffix
    if verdict == "review":
        why = (" Experience could not be read from the resume, so a person should check it." if experience_unverified
               else f" Match probability {prob:.0%} is just below the {thr:.0%} bar.")
        if total == 0:
            return "Possible match, needs a review: based on overall profile similarity only." + why + suffix
        head = f"Covers {len(matched)} of {total} required skills" + (f" (+{len(partial)} partially)" if partial else "")
        tail = f" Missing: {', '.join(missing[:5])}." if missing else ""
        return f"Possible match, needs a review: {head}." + why + tail + suffix
    if total == 0:
        return (("Eligible on overall profile similarity." + suffix) if eligible
                else "Not eligible: the role lists no required skills and the overall profile similarity is low." + suffix)
    head = f"Covers {len(matched)} of {total} required skills"
    if partial:
        head += f" (+{len(partial)} partially)"
    if eligible:
        return head + f"; match probability {prob:.0%}." + suffix
    tail = f" Missing: {', '.join(missing[:5])}." if missing else ""
    min_exp, exp = detail.get("minExperienceYears"), detail.get("experienceYears")
    if min_exp and (exp or 0) < min_exp and detail.get("level") == "experienced":   # fresher / any: experience is not asked
        tail += f" Experience {exp or 0:g} yrs vs {min_exp:g} yrs asked."
    return f"Not eligible: {head}; match probability {prob:.0%} is below the {thr:.0%} bar." + tail + suffix


def evaluate_match(resume: dict, role_title: str, requirements: dict, side=None, role_side=None,
                   academic: dict | None = None) -> MatchResult:
    """`side` = build_resume_side(resume), `role_side` = build_role_side(title, requirements): pass them (cached) when one
    resume meets many roles or one role meets many resumes, so each half is prepared once.
    `academic` = the applicant's users_service.ApplicantProfile values {cgpa, branch, passingYear, backlogs, academicVerified}
    (None when unknown). Campus rules are hard gates: failed -> not eligible, unknown -> eligible + `unverifiedRules`."""
    requirements = requirements or {}
    fr = compute_features(resume or {}, role_title or "", requirements, side=side, role_side=role_side)
    rule_out = rules.evaluate_rules(requirements, resume, academic)
    exp_rules = experience.role_rules(requirements)       # set by the company per role (max / strict are optional)
    detail = {**fr.detail, "maxExperienceYears": exp_rules["max"], "strictMinExperience": exp_rules["strict"]}
    d = scorer.judge(fr.features, detail, extra_gates=rule_out.failed)
    score, eligible, prob, gates = d.score, d.eligible, d.prob, d.gates

    req = fr.detail["required"]
    matched = [c["skill"] for c in req if c["credit"] >= MATCHED_AT]
    partial = [c["skill"] for c in req if PARTIAL_AT <= c["credit"] < MATCHED_AT]
    missing = [c["skill"] for c in req if c["credit"] < PARTIAL_AT]
    thr = d.threshold

    return MatchResult(
        score=score, eligible=eligible, verdict=d.verdict,
        reason=_reason(d.verdict, prob, thr, gates, matched, partial, missing, fr.detail, rule_out.unverified, d.experienceUnverified),
        matchedSkills=matched, partialSkills=partial, missingSkills=missing,
        breakdown={
            "probability": round(float(prob), 4), "threshold": thr, "gatesFailed": gates,
            "features": {k: round(float(v), 4) for k, v in fr.features.items()},
            "skills": [_skill_row(c) for c in req],
            "preferred": [_skill_row(c) for c in fr.detail["preferred"]],
            "experienceYears": fr.detail["experienceYears"], "minExperienceYears": fr.detail["minExperienceYears"],
            "level": fr.detail["level"], "rules": rule_out.detail,
            # verdict + experience details (matching-results-service stores `breakdown` as it is)
            "verdict": d.verdict, "reviewLower": d.reviewLower,
            "experienceRules": exp_rules, "experienceUnverified": d.experienceUnverified, "overqualified": d.overqualified,
        },
        modelVersion=scorer.model_version(),
        unverifiedRules=rule_out.unverified,
    )