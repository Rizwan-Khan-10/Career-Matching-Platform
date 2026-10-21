"""Experience rules of ONE role (pure functions, no model, no I/O).

The company sets them per role:
    minExperienceYears     at least this many years (default 0)
    maxExperienceYears     at most this many years. Missing / null = NO upper limit (an explicit "no limit")
    strictMinExperience    true = below the minimum is a hard reject.
                           false / missing = only a big shortfall is a hard reject (EXPERIENCE_GATE_RATIO), as before.
                           (that softer rule applies to level "experienced" only; fresher / any roles do not ask for experience)

A candidate whose experience is UNKNOWN (the resume had no readable dates) is never rejected by these rules:
`unverified` is set and the verdict is downgraded one step (see scorer.judge) so a human looks at it.
"""
from dataclasses import dataclass, field

from app.core import config

EPS = 1e-9


def _num(v):
    try:
        if v is None or isinstance(v, bool):
            return None
        n = float(v)
    except (TypeError, ValueError):
        return None
    return n if n == n and n >= 0 else None     # NaN / negative -> unknown


def role_rules(requirements: dict | None) -> dict:
    """-> {"min": float, "max": float | None, "strict": bool} read from the role requirements.
    A max below the min is a company typo: it is ignored (no upper limit) instead of rejecting everybody."""
    req = requirements or {}
    mn = _num(req.get("minExperienceYears")) or 0.0
    mx = _num(req.get("maxExperienceYears"))
    if mx is not None and mx + EPS < mn:
        mx = None
    return {"min": mn, "max": mx, "strict": req.get("strictMinExperience") is True}


@dataclass
class ExperienceCheck:
    gates: list = field(default_factory=list)   # reasons that veto the pair
    unverified: bool = False                    # the role asks about experience but the candidate's is unknown
    overqualified: str | None = None            # recruiter note, never a gate


def check(level: str, years, min_years, max_years=None, strict: bool = False) -> ExperienceCheck:
    """level = fresher | experienced | any (anything else counts as experienced, the legacy default).
    years = candidate experience in years, or None when unknown."""
    mn = _num(min_years) or 0.0
    mx = _num(max_years)
    if mx is not None and mx + EPS < mn:
        mx = None
    exp = _num(years)
    out = ExperienceCheck()
    if exp is None:
        out.unverified = bool(mn > 0 or mx is not None)
        return out
    if mx is not None and exp > mx + EPS:
        out.gates.append(f"{exp:g} yrs experience, above the {mx:g} yrs maximum set for this role")
    if mn > 0:
        if strict:
            if exp + EPS < mn:
                out.gates.append(f"{exp:g} yrs experience vs {mn:g} yrs required")
        elif (level or "experienced") == "experienced":
            if exp < mn * config.EXPERIENCE_GATE_RATIO and (mn - exp) >= config.EXPERIENCE_GATE_MIN_GAP_YEARS:
                out.gates.append(f"{exp:g} yrs experience vs {mn:g} yrs required")
    if mx is None and mn > 0 and exp > mn + config.OVERQUALIFIED_EXTRA_YEARS + EPS:
        out.overqualified = f"{exp:g} yrs experience vs {mn:g} yrs minimum"
    return out
