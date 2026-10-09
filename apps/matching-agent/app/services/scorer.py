"""Features -> eligibility probability (logistic model) + hard gates.

The weights live in app/artifacts/scorer.json and are produced by training/train.py from a labelled
dataset. Until you train, DEFAULT_MODEL (hand-tuned) is used so the agent still works.
"""
import json
import logging
import math
import os

from app.core import config
from app.core.embeddings import model_name
from app.services.features import FEATURE_NAMES

log = logging.getLogger("matching.scorer")

DEFAULT_MODEL = {
    "version": "default-handtuned-1",
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


def _load() -> dict:
    global _model
    if _model is not None:
        return _model
    model = DEFAULT_MODEL
    path = config.SCORER_PATH
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                cand = json.load(f)
            if cand.get("features") != FEATURE_NAMES:
                log.warning("scorer.json feature list differs from code -> using default weights. Retrain!")
            elif cand.get("embedding_model") and cand["embedding_model"] != model_name():
                log.warning("scorer trained with embedder %s but running %s -> using default weights. Retrain!",
                            cand["embedding_model"], model_name())
            else:
                model = cand
        except Exception as exc:  # corrupt file must never take the agent down
            log.warning("could not load scorer.json (%s) -> using default weights", exc)
    _model = model
    log.info("scorer loaded: %s (threshold=%.2f)", model.get("version"), model.get("threshold", 0.5))
    return _model


def reload():
    global _model
    _model = None
    return _load()


def model_version() -> str:
    return _load().get("version", "unknown")


def threshold() -> float:
    return config.ELIGIBILITY_THRESHOLD if config.ELIGIBILITY_THRESHOLD is not None else float(_load().get("threshold", 0.5))


def probability(features: dict) -> float:
    m = _load()
    z = float(m["bias"]) + sum(
        float(m["weights"].get(n, 0.0)) * (1.0 if n == "has_req_skills" else float(features[n])) for n in FEATURE_NAMES
    )
    if z >= 0:
        return 1.0 / (1.0 + math.exp(-z))
    e = math.exp(z)
    return e / (1.0 + e)


def apply_gates(features: dict, detail: dict) -> list:
    """Hard rules that can veto eligibility whatever the model says. Returns list of reason strings."""
    failed = []
    if features["has_req_skills"] and features["req_cov"] < config.MIN_REQUIRED_SKILL_COVERAGE:
        failed.append(f"covers only {features['req_cov']:.0%} of the required skills")
    min_exp = detail.get("minExperienceYears") or 0.0
    exp = detail.get("experienceYears") or 0.0
    if min_exp and exp < min_exp * config.EXPERIENCE_GATE_RATIO and (min_exp - exp) >= config.EXPERIENCE_GATE_MIN_GAP_YEARS:
        failed.append(f"{exp:g} yrs experience vs {min_exp:g} yrs required")
    return failed


def decide(features: dict, detail: dict):
    """-> (score, eligible, prob, gates_failed). Score is always consistent with eligibility."""
    prob = probability(features)
    thr = threshold()
    gates = apply_gates(features, detail)
    eligible = prob >= thr and not gates
    score = prob if eligible or prob < thr else thr * 0.99   # vetoed pairs never display above threshold
    return round(float(score), 4), eligible, prob, gates