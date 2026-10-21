"""Features -> eligibility probability (logistic model) + hard gates.

The weights live in app/artifacts/scorer.json and are produced by training/train.py from the real labelled dataset.
There is NO silent fallback: with EMBEDDING_BACKEND=minilm (production) a missing / unreadable / mismatching
scorer.json stops the agent at start-up with a clear error (ScorerError). TEST_MODEL (hand-set weights) exists only
for EMBEDDING_BACKEND=hash, i.e. unit tests / CI where the real embedder is not downloaded.
"""
import json
import logging
import math
import os
from dataclasses import dataclass, field

from app.core import config
from app.core.embeddings import model_name
from app.services import experience
from app.services.features import FEATURE_NAMES, BASE_FEATURE_NAMES, FRESHER_FEATURE_NAMES

log = logging.getLogger("matching.scorer")

class ScorerError(RuntimeError):
    """The trained scorer cannot be used (production refuses to start instead of guessing)."""


TEST_MODEL = {   # tests / CI only (EMBEDDING_BACKEND=hash) - never served with a real embedder
    "version": "test-handtuned-1",
    "embedding_model": None,   # None = not tied to a specific embedder
    "features": FEATURE_NAMES,
    "weights": {
        "req_cov": 6.0, "req_exact": 0.8, "req_sem_mean": 2.0, "req_sem_min": 0.8,
        "req_hi_frac": 0.6, "req_mid_frac": 0.4, "req_ev_mean": 0.5, "pref_cov": 0.8,
        "global_sim": 2.0, "title_sim": 1.0, "exp_score": 2.2, "exp_over": 0.3,
        "edu_score": 0.8, "has_req_skills": 0.0,
    },
    "bias": -12.2,
    "threshold": 0.5,
    "metrics": {},
}

_model = None


def _interim_fresher_weights() -> dict:
    """Used only for fresher features the loaded artifact has no weight for (trained before 2.8). See config.py."""
    return {"is_fresher_role": 0.0, "project_evidence": config.FRESHER_PROJECT_WEIGHT,
            "has_internship": config.FRESHER_INTERNSHIP_WEIGHT}


def _weight(m: dict, name: str) -> float:
    w = m["weights"]
    if name in w:
        return float(w[name])
    return _interim_fresher_weights().get(name, 0.0)   # a missing base weight stays 0.0 as before


def _problem_with(cand: dict, path: str) -> str | None:
    """-> why this artifact cannot be used, or None when it is fine."""
    if cand.get("features") not in (FEATURE_NAMES, BASE_FEATURE_NAMES):
        return f"{path}: feature list differs from the code"
    if not isinstance(cand.get("weights"), dict) or not isinstance(cand.get("bias"), (int, float)):
        return f"{path}: weights / bias missing or invalid"
    # an artifact trained before the fresher features (the 14 base ones) stays valid: extras use interim weights
    if cand.get("embedding_model") and cand["embedding_model"] != model_name():
        return f"{path}: trained with embedder {cand['embedding_model']} but running {model_name()}"
    return None


def _read_artifact() -> dict:
    path = config.SCORER_PATH
    problem, cand = None, None
    if not os.path.exists(path):
        problem = f"scorer file not found: {path}"
    else:
        try:
            with open(path, "r", encoding="utf-8") as f:
                cand = json.load(f)
            if not isinstance(cand, dict):
                problem = f"{path}: not a JSON object"
        except Exception as exc:
            problem = f"could not read {path}: {exc}"
    if problem is None and cand is not None:
        problem = _problem_with(cand, path)
    if problem is None:
        return cand
    if config.EMBEDDING_BACKEND == "hash":
        log.warning("%s -> using TEST_MODEL (hash backend, tests only). Retrain!", problem)
        return TEST_MODEL
    raise ScorerError(f"{problem}. Train a scorer first (training/README.md: build_real_dataset -> train -> evaluate) "
                      "and commit app/artifacts/scorer.json.")


def _load() -> dict:
    global _model
    if _model is not None:
        return _model
    _model = _read_artifact()
    log.info("scorer loaded: %s (threshold=%.2f)", _model.get("version"), _model.get("threshold", 0.5))
    return _model


def ensure_loaded() -> dict:
    """Called once at start-up: raises ScorerError (production) instead of failing on the first match."""
    return _load()


def reload():
    global _model
    _model = None
    return _load()


def _uses_interim() -> bool:
    return any(n not in _load()["weights"] for n in FRESHER_FEATURE_NAMES)


def model_version() -> str:
    """Part of the input hash: the suffix makes pairs re-score once when the interim fresher weights apply."""
    v = _load().get("version", "unknown")
    return f"{v}+fresher-interim" if _uses_interim() else v


def _is_fresher(level) -> bool:
    return str(level or "experienced") in ("fresher", "any")      # same grouping as rules.is_fresher_level


def threshold(level: str | None = None) -> float:
    """Probability needed for 'eligible'. Fresher / any roles can have their own bar (FRESHER_ELIGIBILITY_THRESHOLD)."""
    if _is_fresher(level) and level is not None and config.FRESHER_ELIGIBILITY_THRESHOLD is not None:
        return config.FRESHER_ELIGIBILITY_THRESHOLD
    return config.ELIGIBILITY_THRESHOLD if config.ELIGIBILITY_THRESHOLD is not None else float(_load().get("threshold", 0.5))


def review_lower(level: str | None = None) -> float:
    """Lowest probability of the 'review' band. Equal to the threshold when the band is off (REVIEW_BAND_WIDTH=0)."""
    thr = threshold(level)
    return round(max(0.0, thr - max(config.REVIEW_BAND_WIDTH, 0.0)), 6)


def policy_key() -> str:
    """Everything OUTSIDE the model weights that can change a pair's verdict (thresholds, review band, gates, interim
    fresher weights). It goes into the input hash: change any of these settings and old pairs are scored again
    instead of being skipped as 'unchanged'."""
    parts = [("t", threshold()), ("ft", config.FRESHER_ELIGIBILITY_THRESHOLD if config.FRESHER_ELIGIBILITY_THRESHOLD is not None else -1),
             ("bw", config.REVIEW_BAND_WIDTH), ("cov", config.MIN_REQUIRED_SKILL_COVERAGE),
             ("er", config.EXPERIENCE_GATE_RATIO), ("eg", config.EXPERIENCE_GATE_MIN_GAP_YEARS),
             ("oq", config.OVERQUALIFIED_EXTRA_YEARS), ("fp", config.FRESHER_PROJECT_WEIGHT), ("fi", config.FRESHER_INTERNSHIP_WEIGHT)]
    return "|".join(f"{k}{v:g}" for k, v in parts)


def probability(features: dict) -> float:
    m = _load()
    z = float(m["bias"]) + sum(
        _weight(m, n) * (1.0 if n == "has_req_skills" else float(features[n])) for n in FEATURE_NAMES
    )
    if z >= 0:
        return 1.0 / (1.0 + math.exp(-z))
    e = math.exp(z)
    return e / (1.0 + e)


def _experience_check(detail: dict) -> experience.ExperienceCheck:
    return experience.check(detail.get("level", "experienced"), detail.get("experienceYears"), detail.get("minExperienceYears"),
                            detail.get("maxExperienceYears"), bool(detail.get("strictMinExperience")))


def apply_gates(features: dict, detail: dict) -> list:
    """Hard rules that can veto eligibility whatever the model says. Returns list of reason strings.
    Experience rules come from the company (see experience.py); unknown experience never vetoes."""
    failed = []
    if features["has_req_skills"] and features["req_cov"] < config.MIN_REQUIRED_SKILL_COVERAGE:
        failed.append(f"covers only {features['req_cov']:.0%} of the required skills")
    failed += _experience_check(detail).gates
    return failed


@dataclass
class Decision:
    score: float
    eligible: bool                  # verdict == "eligible"
    verdict: str                    # eligible | review | not_eligible
    prob: float
    gates: list = field(default_factory=list)
    threshold: float = 0.5
    reviewLower: float = 0.5
    overqualified: str | None = None
    experienceUnverified: bool = False


def judge(features: dict, detail: dict, extra_gates: list | None = None) -> Decision:
    """The verdict of one pair.
      not_eligible  a hard gate failed, or probability < review_lower
      review        no gate failed and review_lower <= probability < threshold   (a "possible match", a human decides)
                    also: eligible by score but the experience the role asks about is unknown
      eligible      no gate failed and probability >= threshold
    `extra_gates` = reasons of other hard rules (campus rules). The score is always consistent with the verdict:
    eligible >= threshold > review >= review_lower > anything else, so sorting by score never contradicts the verdict."""
    level = detail.get("level", "experienced")
    prob = probability(features)
    thr, lo = threshold(level), review_lower(level)
    chk = _experience_check(detail)
    gates = apply_gates(features, detail) + list(extra_gates or [])
    band_on = config.REVIEW_BAND_WIDTH > 0
    if gates:
        verdict = "not_eligible"
    elif prob + 1e-9 >= thr:
        verdict = "review" if (chk.unverified and band_on) else "eligible"
    elif band_on and prob + 1e-9 >= lo:
        verdict = "review"
    else:
        verdict = "not_eligible"
    if verdict == "eligible":
        score = prob
    elif verdict == "review":
        score = min(prob, thr * 0.99)
    else:
        score = min(prob, lo * 0.99) if prob + 1e-9 >= lo else prob      # vetoed pairs never rank above review pairs
    return Decision(score=round(float(score), 4), eligible=verdict == "eligible", verdict=verdict, prob=prob, gates=gates,
                    threshold=thr, reviewLower=lo, overqualified=chk.overqualified, experienceUnverified=chk.unverified)


def decide(features: dict, detail: dict, extra_gates: list | None = None):
    """-> (score, eligible, prob, gates_failed). Kept for older callers; judge() has the full verdict."""
    d = judge(features, detail, extra_gates)
    return d.score, d.eligible, d.prob, d.gates
