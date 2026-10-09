"""Turns (resume, role) into a fixed feature vector using EMBEDDINGS (semantic), not keyword overlap.

Per required skill we ask: "is there something in this resume that MEANS the same thing?"
  - nearest resume *skill* by cosine similarity   (e.g. 'ReactJS' ~ 'react', 'k8s' ~ 'kubernetes')
  - nearest resume *evidence sentence* (projects / experience) by cosine similarity
    (e.g. required 'rest api'  <-  'built a backend service exposing JSON endpoints')
These per-skill similarities are summarised into features. A trained logistic model (scorer.py)
turns the features into an eligibility probability.
"""
import re
from dataclasses import dataclass, field
import numpy as np

from app.core.embeddings import embed_many
from app.services.skills import dedupe_skills, normalize_skill, embedding_text_for_skill
from app.services.profile_text import resume_profile_text, role_profile_text

FEATURE_NAMES = [
    "req_cov",        # soft coverage of required skills (headline feature)
    "req_exact",      # fraction of required skills literally present after normalisation
    "req_sem_mean",   # mean over required skills of best skill-vs-skill cosine
    "req_sem_min",    # worst-covered required skill (a single big gap matters)
    "req_hi_frac",    # fraction of required skills with a strong match (cos >= 0.75)
    "req_mid_frac",   # fraction with at least a related match (cos >= 0.55)
    "req_ev_mean",    # mean best similarity to projects/experience text
    "pref_cov",       # soft coverage of preferred (nice-to-have) skills
    "global_sim",     # cosine(resume profile, role profile)
    "title_sim",      # cosine(role title, candidate titles)
    "exp_score",      # candidate experience / required experience (capped at 1)
    "exp_over",       # extra experience beyond the minimum (capped, small bonus)
    "edu_score",      # education level vs required level
    "has_req_skills", # 1 if the JD listed required skills at all
]

# ramps that turn a raw cosine into a 0..1 credit
SKILL_LO, SKILL_HI = 0.45, 0.80   # skill-vs-skill
EVID_LO, EVID_HI = 0.30, 0.55     # skill-vs-sentence (sentences are longer -> lower cosines)
EVIDENCE_WEIGHT = 0.9             # evidence-only skills count a bit less than a listed skill
_AMBIGUOUS = {"c", "r", "go", "ui", "ux", "ci cd"}  # too short/common to trust a text mention


def _ramp(x: float, lo: float, hi: float) -> float:
    return float(min(max((x - lo) / (hi - lo), 0.0), 1.0))


def _num(v):
    try:
        if v is None or isinstance(v, bool):
            return None
        return float(v)
    except (TypeError, ValueError):
        return None


# ---------------------------------------------------------------- education
_LEVEL_PATTERNS = [
    (5, re.compile(r"\b(ph\.?\s?d|doctorate|doctoral)\b")),
    (4, re.compile(r"\b(m\.?\s?tech|mtech|m\.?\s?sc|msc|m\.?c\.?a|mca|mba|master'?s?|post\s?graduate|postgraduate)\b|\bm\.e\b")),
    (3, re.compile(r"\b(b\.?\s?tech|btech|b\.?\s?sc|bsc|b\.?c\.?a|bca|b\.?\s?com|bachelor'?s?|undergraduate)\b|\bb\.e\b|\bb\.a\b")),
    (2, re.compile(r"\b(diploma|polytechnic|associate)\b")),
    (1, re.compile(r"\b(high school|12th|hsc|intermediate|10th|ssc)\b")),
]


_GENERIC_DEGREE = re.compile(r"\b(degree|graduate|graduation)\b")


def education_levels(text) -> list:
    """Levels mentioned in text (1 school .. 5 PhD). A bare 'degree'/'graduate' only counts (as bachelor)
    when no specific level is named, otherwise "Master's degree" would also read as a bachelor requirement."""
    t = (str(text) if text else "").lower()
    found = [lvl for lvl, rx in _LEVEL_PATTERNS if rx.search(t)]
    if not found and _GENERIC_DEGREE.search(t):
        found = [3]
    return found


def _edu_score(candidate_edu, required_edu) -> float:
    req = education_levels(required_edu)
    if not req:
        return 1.0                       # JD doesn't say -> don't punish
    need = min(req)                      # "B.Tech or M.Tech" -> bachelor is enough
    have = education_levels(candidate_edu)
    if not have:
        return 0.5                       # unknown -> neutral-ish
    gap = need - max(have)
    return 1.0 if gap <= 0 else max(0.0, 1.0 - 0.4 * gap)


# ------------------------------------------------------------ text mentions
_TOKEN = re.compile(r"[a-z0-9+#./]+")


def _mention_set(texts) -> set:
    """Canonical skill names that are *mentioned* in free text (alias-aware, so 'ReactJS' -> 'react')."""
    found = set()
    for t in texts:
        toks = [x.strip(".") for x in _TOKEN.findall((t or "").lower())]
        toks = [x for x in toks if x]
        for n in (1, 2, 3):
            for i in range(len(toks) - n + 1):
                found.add(normalize_skill(" ".join(toks[i:i + n])))
    return found


# ---------------------------------------------------------------- core
@dataclass
class ResumeSide:
    skills: list
    skill_vecs: np.ndarray
    evidence_texts: list
    evidence_vecs: np.ndarray
    mentions: set
    titles: list
    title_vecs: np.ndarray
    profile_vec: np.ndarray
    experience_years: float | None
    education: str


def build_resume_side(resume: dict) -> ResumeSide:
    resume = resume or {}
    skills = dedupe_skills(resume.get("skills"))[:80]

    evidence = []
    for p in (resume.get("projects") or [])[:12]:
        if isinstance(p, dict):
            evidence.append(f"{p.get('name') or ''}. {p.get('description') or ''}".strip()[:300])
    titles = []
    for e in (resume.get("experience") or [])[:10]:
        if isinstance(e, dict):
            t = str(e.get("title") or "").strip()
            if t:
                titles.append(t)
            evidence.append(f"{t}. {e.get('description') or ''}".strip()[:300])
    for key in ("currentTitle", "headline"):
        if resume.get(key):
            titles.append(str(resume[key]).strip())
    evidence = [e for e in evidence if len(e) > 3]

    texts = [embedding_text_for_skill(s) for s in skills] + evidence + titles + [resume_profile_text(resume)]
    vecs = embed_many(texts)
    ns, ne, nt = len(skills), len(evidence), len(titles)
    return ResumeSide(
        skills=skills,
        skill_vecs=vecs[:ns],
        evidence_texts=evidence,
        evidence_vecs=vecs[ns:ns + ne],
        mentions=_mention_set(evidence),
        titles=titles,
        title_vecs=vecs[ns + ne:ns + ne + nt],
        profile_vec=vecs[-1],
        experience_years=_num(resume.get("experienceYears")),
        education=str(resume.get("education") or ""),
    )


def _skill_credits(wanted: list, side: ResumeSide) -> list:
    """For each wanted skill -> dict(skill, credit, via, matchedWith, similarity, sim_skill, sim_ev)."""
    if not wanted:
        return []
    wvecs = embed_many([embedding_text_for_skill(s) for s in wanted])
    s_skill = wvecs @ side.skill_vecs.T if len(side.skills) else np.zeros((len(wanted), 0))
    s_ev = wvecs @ side.evidence_vecs.T if len(side.evidence_texts) else np.zeros((len(wanted), 0))
    have = set(side.skills)
    out = []
    for i, skill in enumerate(wanted):
        best_s = float(s_skill[i].max()) if s_skill.shape[1] else 0.0
        arg_s = int(s_skill[i].argmax()) if s_skill.shape[1] else -1
        best_e = float(s_ev[i].max()) if s_ev.shape[1] else 0.0
        mentioned = skill in side.mentions and skill not in _AMBIGUOUS

        if skill in have:
            credit, via, with_, sim = 1.0, "exact", skill, 1.0
        else:
            c_skill = _ramp(best_s, SKILL_LO, SKILL_HI)
            c_ev = EVIDENCE_WEIGHT * _ramp(best_e, EVID_LO, EVID_HI)
            c_men = EVIDENCE_WEIGHT if mentioned else 0.0
            credit = max(c_skill, c_ev, c_men)
            if credit == c_men and mentioned:
                via, with_, sim = "evidence", "project/experience text", best_e
            elif credit == c_skill and c_skill > 0:
                via, with_, sim = "semantic", side.skills[arg_s], best_s
            elif c_ev > 0:
                via, with_, sim = "evidence", "project/experience text", best_e
            else:
                via, with_, sim = "none", None, max(best_s, best_e)
        out.append({"skill": skill, "credit": round(float(credit), 4), "via": via,
                    "matchedWith": with_, "similarity": round(float(sim), 4),
                    "sim_skill": best_s, "sim_ev": best_e, "exact": skill in have})
    return out


@dataclass
class FeatureResult:
    features: dict
    detail: dict = field(default_factory=dict)

    def vector(self) -> list:
        return [float(self.features[n]) for n in FEATURE_NAMES]


def compute_features(resume: dict, role_title: str, req: dict, side: ResumeSide | None = None) -> FeatureResult:
    req = req or {}
    side = side or build_resume_side(resume)
    required = dedupe_skills(req.get("requiredSkills"))[:40]
    preferred = [s for s in dedupe_skills(req.get("preferredSkills"))[:20] if s not in required]

    role_vec = embed_many([role_profile_text(role_title, req)])[0]
    global_sim = float(max(0.0, np.dot(side.profile_vec, role_vec)))

    req_credits = _skill_credits(required, side)
    pref_credits = _skill_credits(preferred, side)

    if req_credits:
        credit = np.array([c["credit"] for c in req_credits])
        sim_s = np.clip([c["sim_skill"] for c in req_credits], 0, 1)
        sim_e = np.clip([max(c["sim_ev"], 0.6 if c["via"] == "evidence" else 0.0) for c in req_credits], 0, 1)
        exact = np.array([1.0 if c["exact"] else 0.0 for c in req_credits])
        eff = np.where(exact > 0, 1.0, sim_s)
        f_req = dict(
            req_cov=float(credit.mean()), req_exact=float(exact.mean()),
            req_sem_mean=float(eff.mean()), req_sem_min=float(eff.min()),
            req_hi_frac=float((eff >= 0.75).mean()), req_mid_frac=float((eff >= 0.55).mean()),
            req_ev_mean=float(sim_e.mean()),
        )
        has_req = 1.0
    else:
        g = min(global_sim, 1.0)   # no required skills listed -> fall back to overall similarity
        f_req = dict(req_cov=g, req_exact=0.0, req_sem_mean=g, req_sem_min=g, req_hi_frac=0.0, req_mid_frac=0.0, req_ev_mean=g)
        has_req = 0.0

    pref_cov = float(np.mean([c["credit"] for c in pref_credits])) if pref_credits else f_req["req_cov"]

    if side.title_vecs.shape[0]:
        tvec = embed_many([role_title or req.get("title") or ""])[0]
        title_sim = float(max(0.0, (side.title_vecs @ tvec).max()))
    else:
        title_sim = global_sim

    min_exp = _num(req.get("minExperienceYears")) or 0.0
    exp = side.experience_years if side.experience_years is not None else 0.0
    exp_score = 1.0 if min_exp <= 0 else min(max(exp / min_exp, 0.0), 1.0)
    exp_over = min(max(exp - min_exp, 0.0) / 5.0, 1.0)

    features = {**f_req, "pref_cov": pref_cov, "global_sim": min(global_sim, 1.0), "title_sim": min(title_sim, 1.0),
                "exp_score": exp_score, "exp_over": exp_over,
                "edu_score": _edu_score(side.education, req.get("qualifications")), "has_req_skills": has_req}
    detail = {"required": req_credits, "preferred": pref_credits, "experienceYears": side.experience_years,
              "minExperienceYears": min_exp or None, "candidateSkillCount": len(side.skills)}
    return FeatureResult(features=features, detail=detail)