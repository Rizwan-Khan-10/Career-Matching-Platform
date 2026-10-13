"""Trains the eligibility scorer on REAL labelled pairs.

    python -m training.build_real_dataset ...                        # -> training/data/real_pairs.jsonl
    python -m scripts.export_real_labels --out training/data/recruiter_labels.jsonl   # Shortlist / Reject clicks
    python -m training.train --real training/data/real_pairs.jsonl training/data/recruiter_labels.jsonl \
                             --recruiter training/data/recruiter_labels.jsonl --recruiter-weight 5

Output: app/artifacts/scorer.json (picked up by the agent; restart it and open GET /model).
Run with the SAME embedder you deploy with (EMBEDDING_BACKEND=minilm / bge).
"""
import argparse
import datetime as dt
import json
import numpy as np
from sklearn.model_selection import GroupKFold

from app.core.embeddings import model_name
from app.services.features import FEATURE_NAMES
from training import bounded_logreg
from training.common import (load_rows, build_matrix, split_by_group, metrics, best_threshold,
                             ranking_metrics, calibration_error)

NONNEG = np.array([n != "has_req_skills" for n in FEATURE_NAMES])   # every quality feature must help, never hurt


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--real", nargs="+", required=True, help="real labelled pairs (jsonl)")
    ap.add_argument("--recruiter", nargs="*", default=[], help="subset of --real that are recruiter decisions (gold)")
    ap.add_argument("--recruiter-weight", type=float, default=5.0)
    ap.add_argument("--synthetic", nargs="*", default=[])
    ap.add_argument("--synthetic-weight", type=float, default=0.2)
    ap.add_argument("--beta", type=float, default=0.5, help="F-beta for the threshold; <1 favours precision (default 0.5)")
    ap.add_argument("--out", default="app/artifacts/scorer.json")
    a = ap.parse_args()

    real = load_rows(*a.real)
    syn = load_rows(*a.synthetic) if a.synthetic else []
    gold = {r["_src"] for r in load_rows(*a.recruiter)} if a.recruiter else set()
    rows = real + syn
    print(f"{len(real)} real pairs | {len(syn)} synthetic | embedder = {model_name()}")
    if len(real) < 300:
        print("WARNING: <300 real pairs - metrics below are unreliable, do not ship this model.")

    M = build_matrix(rows)
    X, y, groups, splits = M["X"], M["y"], M["groups"], M["splits"]
    src_w = np.array([1.0 if i < len(real) else a.synthetic_weight for i in range(len(rows))])
    gold_w = np.array([a.recruiter_weight if r["_src"] in gold else 1.0 for r in rows])
    w = src_w * gold_w * np.array([float(r.get("weight", 1.0)) for r in rows])
    is_real = np.arange(len(rows)) < len(real)

    tr, te = split_by_group(splits)                  # keeps ALL pairs of one resume (real data) / role (synthetic) on one side
    te_real = te & is_real
    print(f"train={tr.sum()}  held-out={te.sum()} (real held-out={te_real.sum()})")

    # 1) C + threshold from out-of-fold predictions on TRAIN (real rows only decide the threshold)
    best = None
    for C in (0.1, 0.3, 1.0, 3.0, 10.0):
        oof = np.zeros(tr.sum())
        Xt, yt, st, wt = X[tr], y[tr], splits[tr], w[tr]
        for fit_i, val_i in GroupKFold(n_splits=5).split(Xt, yt, st):
            coef, b = bounded_logreg.fit(Xt[fit_i], yt[fit_i], wt[fit_i], C=C, nonneg=NONNEG)
            oof[val_i] = bounded_logreg.predict_proba(Xt[val_i], coef, b)
        sel = is_real[tr]
        thr, f = best_threshold(yt[sel], oof[sel], a.beta)
        if best is None or f > best[0]:
            best = (f, C, thr)
    f_cv, C, thr = best
    print(f"chosen C={C}  threshold={thr}  (cv F{a.beta:g}={f_cv})")

    # 2) honest numbers on held-out REAL pairs
    coef, b = bounded_logreg.fit(X[tr], y[tr], w[tr], C=C, nonneg=NONNEG)
    p = bounded_logreg.predict_proba(X[te_real], coef, b)
    test_metrics = metrics(y[te_real], (p >= thr).astype(int), p)
    test_metrics["ece"] = calibration_error(y[te_real], p)
    test_metrics["ranking"] = ranking_metrics(y[te_real], p, groups[te_real], k=5)
    print("held-out (real):", json.dumps(test_metrics))

    # 3) final model on everything
    coef, b = bounded_logreg.fit(X, y, w, C=C, nonneg=NONNEG)
    artifact = {
        "version": f"blr-{dt.date.today().isoformat()}-real{len(real)}",
        "embedding_model": model_name(),
        "features": FEATURE_NAMES,
        "weights": {n: round(float(c), 5) for n, c in zip(FEATURE_NAMES, coef)},
        "bias": round(float(b), 5),
        "threshold": thr,
        "metrics": {"held_out_real": test_metrics, "cv_f_beta": f_cv, "beta": a.beta, "C": C,
                    "n_real_pairs": len(real), "n_synthetic_pairs": len(syn), "n_recruiter_pairs": int(sum(r["_src"] in gold for r in rows))},
    }
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump(artifact, f, indent=2)
    print(f"saved -> {a.out}\nfeature weights:")
    for n, c in sorted(artifact["weights"].items(), key=lambda kv: -abs(kv[1])):
        print(f"  {n:16s} {c:+.3f}")
    bad = [n for n, c in artifact["weights"].items() if n != "has_req_skills" and c < 0]
    assert not bad, f"negative weights slipped through: {bad}"


if __name__ == "__main__":
    main()