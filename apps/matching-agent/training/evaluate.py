"""Compares the trained pipeline against two naive baselines on the held-out roles.

    python -m training.evaluate --data training/data/dataset.jsonl

 baseline A  "cosine only"    : global resume<->JD embedding similarity + best threshold
 baseline B  "keyword overlap": share of required skills literally present + best threshold
 ours        "model"          : logistic scorer on semantic features (probability only)
 ours+gates  "full pipeline"  : exactly what the agent publishes (model + hard rules)
"""
import argparse
import numpy as np

from app.core import config
from app.core.embeddings import model_name
from app.services import scorer
from app.services.features import FEATURE_NAMES
from training.common import load_rows, build_matrix, split_by_group, metrics, best_threshold


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", nargs="+", default=["training/data/dataset.jsonl"])
    a = ap.parse_args()
    rows = load_rows(*a.data)
    M = build_matrix(rows)
    X, y, groups, kinds = M["X"], M["y"], M["groups"], M["kinds"]
    tr, te = split_by_group(groups)
    col = {n: i for i, n in enumerate(FEATURE_NAMES)}
    print(f"embedder={model_name()} scorer={scorer.model_version()} held-out pairs={te.sum()}\n")

    def baseline(name, feat):
        t, _ = best_threshold(y[tr], X[tr, col[feat]])
        s = X[te, col[feat]]
        return name, metrics(y[te], (s >= t).astype(int), s)

    probs = np.array([scorer.probability(dict(zip(FEATURE_NAMES, x))) for x in X[te]])
    thr = scorer.threshold()
    full = []
    for x, e, me in zip(X[te], M["exp"][te], M["min_exp"][te]):
        f = dict(zip(FEATURE_NAMES, x))
        full.append(int(scorer.probability(f) >= thr and not scorer.apply_gates(f, {"experienceYears": e, "minExperienceYears": me or None})))
    full = np.array(full)

    results = [
        baseline("A cosine-only", "global_sim"),
        baseline("B keyword overlap", "req_exact"),
        ("ours: model", metrics(y[te], (probs >= thr).astype(int), probs)),
        ("ours: full pipeline", metrics(y[te], full, probs)),
    ]
    print(f"{'method':22s} {'acc':>6s} {'prec':>6s} {'rec':>6s} {'f1':>6s} {'auc':>6s}")
    for name, m in results:
        print(f"{name:22s} {m['accuracy']:6.3f} {m['precision']:6.3f} {m['recall']:6.3f} {m['f1']:6.3f} {m.get('roc_auc', float('nan')):6.3f}")

    print("\nfull pipeline accuracy by candidate type (held-out):")
    for k in sorted(set(kinds[te].tolist())):
        idx = kinds[te] == k
        acc = (full[idx] == y[te][idx]).mean()
        print(f"  {k:14s} n={idx.sum():4d}  acc={acc:.3f}  predicted-eligible={full[idx].mean():.2f}  truly-eligible={y[te][idx].mean():.2f}")


if __name__ == "__main__":
    main()