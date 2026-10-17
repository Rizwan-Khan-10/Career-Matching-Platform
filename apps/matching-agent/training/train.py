"""Trains the eligibility scorer on REAL labelled pairs.

    python -m training.build_real_dataset ...                        # -> training/data/real_pairs.jsonl
    python -m scripts.export_real_labels --out training/data/recruiter_labels.jsonl   # Shortlist / Reject clicks
    python -m training.train --real training/data/real_pairs.jsonl training/data/recruiter_labels.jsonl \
                             --recruiter training/data/recruiter_labels.jsonl --recruiter-weight 5

Output: app/artifacts/scorer.json (picked up by the agent; restart it and open GET /model).
Run with the SAME embedder you deploy with (EMBEDDING_BACKEND=minilm / bge).

Rules enforced here:
  * the hand-labelled GOLD set (training/gold) is never trained on: gold files/rows are refused and any training row that
    shares a role or a resume with the gold set is dropped. Only training/evaluate.py reads the gold set.
  * the held-out split is role-wise AND resume-wise (training.common.split_disjoint): no role and no resume is on both sides.
  * protected attributes (name, gender, photo, institution) are never features (training/fairness.py).
"""
import argparse
import datetime as dt
import hashlib
import json
import numpy as np
from sklearn.model_selection import GroupKFold

from app.core.embeddings import model_name
from app.services.features import FEATURE_NAMES
from training import bounded_logreg
from training.common import (load_rows, build_matrix, holdout_split, metrics, best_threshold,
                             ranking_metrics, calibration_error, drop_gold_overlap, row_keys)
from training.fairness import assert_fair_features

FREE_SIGN = {"has_req_skills", "is_fresher_role"}   # constant-ish flags: has_req_skills is a bias shift, is_fresher_role marks the role type
NONNEG = np.array([n not in FREE_SIGN for n in FEATURE_NAMES])   # every quality feature (incl. project_evidence, has_internship) must help, never hurt
GOLD_DEFAULT = "training/gold/gold_pairs.jsonl"


def refuse_gold(paths, rows):
    """The gold set is for evaluate.py only."""
    for p in paths:
        if "gold" in p.replace("\\", "/").lower().split("/"):
            raise SystemExit(f"refusing to train on {p}: the gold set is only for training/evaluate.py")
    bad = [r for r in rows if str(r.get("kind", "")).startswith("gold")]
    if bad:
        raise SystemExit(f"refusing to train: {len(bad)} rows are marked kind=gold-* (gold set is only for evaluate.py)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--real", nargs="+", required=True, help="real labelled pairs (jsonl)")
    ap.add_argument("--recruiter", nargs="*", default=[], help="subset of --real that are recruiter decisions (gold)")
    ap.add_argument("--recruiter-weight", type=float, default=5.0)
    ap.add_argument("--beta", type=float, default=0.5, help="F-beta for the threshold; <1 favours precision (default 0.5)")
    ap.add_argument("--test-frac", type=float, default=0.2, help="share of roles AND of resumes held out (pairs mixing both sides are unused)")
    ap.add_argument("--seed", type=int, default=7, help="split seed (evaluate.py must use the same value)")
    ap.add_argument("--gold", default=GOLD_DEFAULT, help="gold set: only used to drop overlapping training rows")
    ap.add_argument("--version", default=None, help="override the scorer version label")
    ap.add_argument("--out", default="app/artifacts/scorer.json")
    a = ap.parse_args()

    assert_fair_features(FEATURE_NAMES)
    real = load_rows(*a.real)
    refuse_gold(list(a.real), real)
    real, dropped = drop_gold_overlap(real, a.gold)
    if dropped:
        print(f"dropped {dropped} training rows that share a role or resume with the gold set")
    gold = {r["_src"] for r in load_rows(*a.recruiter)} if a.recruiter else set()
    rows = real
    print(f"{len(real)} real pairs | embedder = {model_name()}")
    if len(real) < 300:
        print("WARNING: <300 real pairs - metrics below are unreliable, do not ship this model.")

    M = build_matrix(rows)
    X, y, groups, splits = M["X"], M["y"], M["groups"], M["splits"]
    gold_w = np.array([a.recruiter_weight if r["_src"] in gold else 1.0 for r in rows])
    w = gold_w * np.array([float(r.get("weight", 1.0)) for r in rows])

    tr, te = holdout_split(M, a.test_frac, a.seed)   # role-wise AND resume-wise: nothing is shared between train and held-out
    unused = len(rows) - tr.sum() - te.sum()
    print(f"train={tr.sum()}  held-out={te.sum()}  unused (mixed roles/resumes)={unused}")
    if te.sum() < 30 or len(set(y[te].tolist())) < 2:
        raise SystemExit("held-out set is too small or has one class only - add data or raise --test-frac")

    # 1) C + threshold from out-of-fold predictions on TRAIN
    best = None
    for C in (0.1, 0.3, 1.0, 3.0, 10.0):
        oof = np.zeros(tr.sum())
        Xt, yt, st, wt = X[tr], y[tr], splits[tr], w[tr]
        for fit_i, val_i in GroupKFold(n_splits=5).split(Xt, yt, st):
            coef, b = bounded_logreg.fit(Xt[fit_i], yt[fit_i], wt[fit_i], C=C, nonneg=NONNEG)
            oof[val_i] = bounded_logreg.predict_proba(Xt[val_i], coef, b)
        thr, f = best_threshold(yt, oof, a.beta)
        if best is None or f > best[0]:
            best = (f, C, thr)
    f_cv, C, thr = best
    print(f"chosen C={C}  threshold={thr}  (cv F{a.beta:g}={f_cv})")

    # 2) honest numbers on the held-out pairs
    coef, b = bounded_logreg.fit(X[tr], y[tr], w[tr], C=C, nonneg=NONNEG)
    p = bounded_logreg.predict_proba(X[te], coef, b)
    test_metrics = metrics(y[te], (p >= thr).astype(int), p)
    test_metrics["ece"] = calibration_error(y[te], p)
    test_metrics["ranking"] = ranking_metrics(y[te], p, groups[te], k=5)
    print("held-out:", json.dumps(test_metrics))

    # 3) final model on everything (gold rows were already excluded above)
    coef, b = bounded_logreg.fit(X, y, w, C=C, nonneg=NONNEG)
    fingerprint = hashlib.md5("".join(sorted(f"{rk}{sk}" for rk, sk in (row_keys(r) for r in rows))).encode()).hexdigest()[:12]
    artifact = {
        "version": a.version or f"blr-{dt.date.today().isoformat()}-real{len(real)}",
        "embedding_model": model_name(),
        "features": FEATURE_NAMES,
        "weights": {n: round(float(c), 5) for n, c in zip(FEATURE_NAMES, coef)},
        "bias": round(float(b), 5),
        "threshold": thr,
        "metrics": {"held_out_real": test_metrics, "cv_f_beta": f_cv, "beta": a.beta, "C": C,
                    "n_real_pairs": len(real), "n_recruiter_pairs": int(sum(r["_src"] in gold for r in rows)),
                    "split": {"mode": "role+resume disjoint", "test_frac": a.test_frac, "seed": a.seed,
                              "train": int(tr.sum()), "held_out": int(te.sum()), "unused": int(unused)},
                    "gold_rows_dropped_from_training": dropped, "data_fingerprint": fingerprint,
                    "fairness": "no name/gender/photo/institution features; institution stripped from education"},
    }
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump(artifact, f, indent=2)
    print(f"saved -> {a.out}  (version {artifact['version']})\nfeature weights:")
    for n, c in sorted(artifact["weights"].items(), key=lambda kv: -abs(kv[1])):
        print(f"  {n:16s} {c:+.3f}")
    bad = [n for n, c in artifact["weights"].items() if n not in FREE_SIGN and c < 0]
    assert not bad, f"negative weights slipped through: {bad}"
    print("\nNext: python -m training.evaluate   (uses the gold set), restart the agent and open GET /model")


if __name__ == "__main__":
    main()