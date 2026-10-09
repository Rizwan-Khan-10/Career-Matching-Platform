"""Trains the eligibility scorer (logistic regression over semantic features).

    pip install -r requirements-train.txt
    python -m training.generate_dataset --roles 500
    python -m training.train --data training/data/dataset.jsonl
    # later, with real recruiter decisions mixed in (same jsonl format, 3x weight):
    python -m training.train --data training/data/dataset.jsonl --extra training/data/real_labels.jsonl

Output: app/artifacts/scorer.json  (picked up automatically by the agent; restart it, check GET /model)
Run it with the SAME embedding backend you deploy with (EMBEDDING_BACKEND=minilm, the default).
"""
import argparse
import datetime as dt
import json
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import GroupKFold

from app.core.embeddings import model_name
from app.services.features import FEATURE_NAMES
from training.common import load_rows, build_matrix, split_by_group, metrics, best_threshold


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", nargs="+", default=["training/data/dataset.jsonl"])
    ap.add_argument("--extra", nargs="*", default=[], help="real labelled pairs (same format), up-weighted")
    ap.add_argument("--extra-weight", type=float, default=3.0)
    ap.add_argument("--beta", type=float, default=1.0, help="F-beta for threshold; <1 favours precision")
    ap.add_argument("--out", default="app/artifacts/scorer.json")
    a = ap.parse_args()

    rows = load_rows(*a.data) + load_rows(*a.extra)
    extra_names = {r["_src"] for r in load_rows(*a.extra)} if a.extra else set()
    print(f"{len(rows)} labelled pairs | embedder = {model_name()}")
    M = build_matrix(rows)
    X, y, groups = M["X"], M["y"], M["groups"]
    w = np.array([a.extra_weight if r["_src"] in extra_names else 1.0 for r in rows])

    tr, te = split_by_group(groups)
    print(f"train={tr.sum()}  held-out test={te.sum()} (split by role, no leakage)")

    # 1) pick regularisation + threshold from out-of-fold predictions on TRAIN only
    best = None
    for C in (0.3, 1.0, 3.0, 10.0, 30.0):
        oof = np.zeros(tr.sum())
        Xt, yt, gt, wt = X[tr], y[tr], groups[tr], w[tr]
        for fit_i, val_i in GroupKFold(n_splits=5).split(Xt, yt, gt):
            m = LogisticRegression(C=C, max_iter=2000).fit(Xt[fit_i], yt[fit_i], sample_weight=wt[fit_i])
            oof[val_i] = m.predict_proba(Xt[val_i])[:, 1]
        thr, f = best_threshold(yt, oof, a.beta)
        if best is None or f > best[0]:
            best = (f, C, thr)
    f_cv, C, thr = best
    print(f"chosen C={C}  threshold={thr}  (cv F{a.beta:g}={f_cv})")

    # 2) honest score on the held-out roles
    m = LogisticRegression(C=C, max_iter=2000).fit(X[tr], y[tr], sample_weight=w[tr])
    p_te = m.predict_proba(X[te])[:, 1]
    test_metrics = metrics(y[te], (p_te >= thr).astype(int), p_te)
    print("held-out:", json.dumps(test_metrics))

    # 3) final model on ALL data with the chosen hyper-parameters
    final = LogisticRegression(C=C, max_iter=2000).fit(X, y, sample_weight=w)
    artifact = {
        "version": f"lr-{dt.date.today().isoformat()}-n{len(rows)}",
        "embedding_model": model_name(),
        "features": FEATURE_NAMES,
        "weights": {n: round(float(c), 5) for n, c in zip(FEATURE_NAMES, final.coef_[0])},
        "bias": round(float(final.intercept_[0]), 5),
        "threshold": thr,
        "metrics": {"held_out": test_metrics, "cv_f_beta": f_cv, "beta": a.beta, "C": C, "n_train_pairs": int(len(rows))},
    }
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump(artifact, f, indent=2)
    print(f"saved -> {a.out}")
    print("feature weights:")
    for n, c in sorted(artifact["weights"].items(), key=lambda kv: -abs(kv[1])):
        print(f"  {n:16s} {c:+.3f}")


if __name__ == "__main__":
    main()