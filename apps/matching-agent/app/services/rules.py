"""Campus eligibility rules (hard gates) + role level.

Rules live in the role requirements (contract 4.1): minCgpa, allowedBranches, passingYears, maxBacklogs.
A rule that is absent / null / empty is NOT applied.  Applicant values follow contract 4.3:

    verified (admin CSV)  >  resume (the resume being evaluated)  >  self (entered by the applicant)

Outcome of a rule for one pair:
    passed      value known and fine
    failed      value known and breaks the rule  -> hard gate (reason + breakdown.gatesFailed)
    unverified  value unknown                    -> NEVER fails; the field name goes to `unverifiedRules`

No LLM, no ML here: pure functions, easy to test.
"""
import hashlib
import json
import re
from dataclasses import dataclass, field

RULE_FIELDS = ("cgpa", "branch", "passingYear", "backlogs")   # names used in `unverifiedRules` (contract 6)
_LABEL = {"cgpa": "CGPA", "branch": "Branch", "passingYear": "Passing year", "backlogs": "Backlogs"}
_CGPA_EPS = 1e-9

LEVELS = ("fresher", "experienced", "any")
DEFAULT_LEVEL = "experienced"   # absent / invalid level = old behaviour, so existing roles do not change


# ------------------------------------------------------------------ level
def normalize_level(req: dict | None) -> str:
    """fresher | experienced | any.  Missing or unknown -> 'experienced' (unchanged legacy behaviour)."""
    raw = str((req or {}).get("level") or "").strip().lower()
    return raw if raw in LEVELS else DEFAULT_LEVEL


def is_fresher_level(req: dict | None) -> bool:
    """fresher and any roles: experience gate off, exp_score neutral, projects / internship count more."""
    return normalize_level(req) in ("fresher", "any")


# ------------------------------------------------------------------ number helpers
def _num(v):
    try:
        if v is None or isinstance(v, bool):
            return None
        if isinstance(v, str):
            v = v.strip().replace(",", ".")
            if not v:
                return None
        return float(v)
    except (TypeError, ValueError):
        return None


def _int(v):
    n = _num(v)
    return None if n is None or n != n else int(round(n))   # n != n -> NaN


def normalize_cgpa(v):
    """CGPA is on a 10 scale; a value > 10 is a percentage -> divide by 10 (contract 4.3). Junk / <0 -> None."""
    n = _num(v)
    if n is None or n != n or n < 0:
        return None
    if n > 10:
        n = n / 10.0
    return round(min(n, 10.0), 2)


# ------------------------------------------------------------------ branch aliases
# canonical name (lower-case) <- spellings. Extend this table, never the logic.
_BRANCH_ALIASES = {
    "computer science": ["cse", "cs", "comp sci", "computer sci", "computer science and engineering",
                         "computer engineering", "comp engg"],
    "information technology": ["it", "info tech", "information tech"],
    "electronics and communication": ["ece", "ec", "electronics and communication engineering",
                                      "electronics communication", "electronics and telecommunication",
                                      "electronics and telecommunication engineering", "entc", "extc", "e and tc"],
    "electrical": ["ee", "electrical engineering", "electrical and electronics", "eee",
                   "electrical and electronics engineering"],
    "mechanical": ["mech", "mechanical engineering"],
    "civil": ["civil engineering"],
    "artificial intelligence and machine learning": ["aiml", "ai ml", "ai and ml", "ai & ml",
                                                      "artificial intelligence and machine learning engineering"],
    "artificial intelligence and data science": ["aids", "ai ds", "ai and ds", "ai and data science"],
    "data science": ["data science and engineering", "ds"],
}
_BRANCH_LOOKUP = {alias: canon for canon, aliases in _BRANCH_ALIASES.items() for alias in aliases}
_BRANCH_LOOKUP.update({canon: canon for canon in _BRANCH_ALIASES})

_DEGREE_PREFIX = re.compile(
    r"^(?:b\s?tech|btech|b\s?e|be|bachelor of technology|bachelor of engineering|bachelors?|degree)\b\s*(?:in|of|-)?\s*")
_TRAILING = re.compile(r"\s+(?:and\s+)?(?:engineering|engg|eng|branch|department|dept)$")


def normalize_branch(raw) -> str:
    """'B.Tech in Computer Science & Engineering' / 'CSE' / 'cse' -> 'computer science'. '' for junk."""
    if raw is None or isinstance(raw, (bool, int, float)):
        return ""
    s = str(raw).strip().lower()
    s = s.replace("&", " and ").replace(".", "")
    s = re.sub(r"[^a-z0-9 ]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    if not s or len(s) > 80:
        return ""
    s = _DEGREE_PREFIX.sub("", s).strip()
    if s in _BRANCH_LOOKUP:
        return _BRANCH_LOOKUP[s]
    stripped = _TRAILING.sub("", s).strip()
    return _BRANCH_LOOKUP.get(stripped, stripped)


# ------------------------------------------------------------------ effective value (contract 4.3)
def _clean(field_name: str, v):
    if field_name == "cgpa":
        return normalize_cgpa(v)
    if field_name == "branch":
        s = str(v).strip() if isinstance(v, str) else None
        return s or None
    n = _int(v)
    if n is None:
        return None
    if field_name == "backlogs":
        return n if n >= 0 else None
    return n if 1990 <= n <= 2100 else None   # passingYear


def effective_value(field_name: str, profile: dict | None, parsed: dict | None) -> dict:
    """-> {"value": ..., "source": "verified" | "resume" | "self" | "unknown"}  (exactly the contract 4.3 order)."""
    profile, parsed = profile or {}, parsed or {}
    if profile.get("academicVerified"):
        v = _clean(field_name, profile.get(field_name))
        if v is not None:
            return {"value": v, "source": "verified"}
    v = _clean(field_name, parsed.get(field_name))
    if v is not None:
        return {"value": v, "source": "resume"}
    v = _clean(field_name, profile.get(field_name))
    if v is not None:
        return {"value": v, "source": "self"}
    return {"value": None, "source": "unknown"}


# ------------------------------------------------------------------ the role's rules
def role_rules(req: dict | None) -> dict:
    """Only the rules that are really set. Absent / null / empty list / junk -> not in the result."""
    req = req or {}
    rules = {}
    min_cgpa = normalize_cgpa(req.get("minCgpa"))
    if min_cgpa is not None and min_cgpa > 0:
        rules["cgpa"] = min_cgpa
    branches = req.get("allowedBranches")
    if isinstance(branches, str):
        branches = [branches]
    if isinstance(branches, list):
        canon = sorted({normalize_branch(b) for b in branches} - {""})
        if canon:
            rules["branch"] = canon
    years = req.get("passingYears")
    if isinstance(years, (int, float, str)) and not isinstance(years, bool):
        years = [years]
    if isinstance(years, list):
        ys = sorted({y for y in (_int(x) for x in years) if y is not None})
        if ys:
            rules["passingYear"] = ys
    max_backlogs = _int(req.get("maxBacklogs"))
    if max_backlogs is not None and max_backlogs >= 0:   # 0 is a real rule ("no backlogs")
        rules["backlogs"] = max_backlogs
    return rules


def has_academic_rules(req: dict | None) -> bool:
    """Used by the profile.updated trigger and by the input hash."""
    return bool(role_rules(req))


# ------------------------------------------------------------------ evaluation
@dataclass
class RuleOutcome:
    failed: list = field(default_factory=list)       # human reasons -> merged into gatesFailed
    unverified: list = field(default_factory=list)   # field names (cgpa, branch, passingYear, backlogs)
    detail: dict = field(default_factory=dict)       # per rule: required / value / source / status (-> breakdown.rules)


def _fmt(v) -> str:
    return f"{v:g}" if isinstance(v, float) else str(v)


def evaluate_rules(req: dict | None, parsed: dict | None, profile: dict | None) -> RuleOutcome:
    """Check every rule the role has against the effective applicant values. Never raises."""
    out = RuleOutcome()
    for name, required in role_rules(req).items():
        eff = effective_value(name, profile, parsed)
        value, source = eff["value"], eff["source"]
        status = "unverified"
        if value is None:
            out.unverified.append(name)
        elif name == "cgpa":
            status = "passed" if value + _CGPA_EPS >= required else "failed"
            if status == "failed":
                out.failed.append(f"CGPA {_fmt(value)} is below the minimum {_fmt(required)}")
        elif name == "branch":
            ok = normalize_branch(value) in required
            status = "passed" if ok else "failed"
            if not ok:
                out.failed.append(f"branch {value} is not among the allowed branches ({', '.join(required)})")
        elif name == "passingYear":
            ok = value in required
            status = "passed" if ok else "failed"
            if not ok:
                out.failed.append(f"passing year {value} is not among the allowed years ({', '.join(map(str, required))})")
        elif name == "backlogs":
            ok = value <= required
            status = "passed" if ok else "failed"
            if not ok:
                out.failed.append(f"{value} backlogs exceed the maximum {required}")
        out.detail[name] = {"required": required, "value": value, "source": source, "status": status}
    return out


def unverified_note(unverified: list) -> str:
    """'CGPA, Branch not verified' (shown to applicant + company)."""
    return ", ".join(_LABEL.get(n, n) for n in unverified) + " not verified" if unverified else ""


# ------------------------------------------------------------------ input hash helper (contract 4.12)
def academic_hash_part(req: dict | None, parsed: dict | None, profile: dict | None):
    """The 'effective academic values used by the role's rules'. None when the role has no academic rule,
    so roles without rules never change their hash because of a profile edit. Plug into the inputHash builder."""
    rules = role_rules(req)
    if not rules:
        return None
    return {n: effective_value(n, profile, parsed) for n in sorted(rules)}


def academic_hash(req: dict | None, parsed: dict | None, profile: dict | None) -> str:
    part = academic_hash_part(req, parsed, profile)
    return "" if part is None else hashlib.sha1(json.dumps(part, sort_keys=True).encode()).hexdigest()