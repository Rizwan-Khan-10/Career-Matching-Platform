"""Evaluates the DEPLOYED scorer (app/artifacts/scorer.json) and compares it with two naive baselines.

    python -m training.evaluate --data training/data/real_pairs.jsonl training/data/recruiter_labels.jsonl --beta 0.5

Two evaluation sets:
  held-out : the role+resume-disjoint split of --data (exactly the split train.py used; use the same --test-frac/--seed)
  gold     : the hand-labelled pairs in training/gold (never trained on; only this script reads them)

Methods:
  A cosine-only      global resume<->JD embedding similarity + best threshold
  B keyword overlap  share of required skills literally present + best threshold
  ours: model        logistic scorer on semantic features (probability only)
  ours: full pipeline  what the agent publishes (model + hard gates)

Baseline thresholds are chosen on the TRAIN side of --data (F-beta, --beta), never on the set being scored.
Without --data they are chosen on the gold set itself and the report marks them "oracle" (flattering to the baselines).
Writes training/reports/eval-<scorer version>.json and .md.
"""
import argparse
import datetime as dt
import json
import os
import numpy as np

from app.core.embeddings import model_name
from app.services import scorer
from app.services.features import FEATURE_NAMES
from training.common import (load_rows, build_matrix, holdout_split, metrics, best_threshold, ranking_metrics,
                             calibration_error, drop_gold_overlap)
from training.fairness import assert_fair_features

COL = {n: i for i, n in enumerate(FEATURE_NAMES)}


def full_pipeline(M, probs):
    thr = scorer.threshold()
    out = []
    for p, x, e, me, lv in zip(probs, M["X"], M["exp"], M["min_exp"], M["level"]):
        f = dict(zip(FEATURE_NAMES, x))
        out.append(int(p >= thr and not scorer.apply_gates(f, {"experienceYears": e, "minExperienceYears": me or None, "level": str(lv)})))
    return np.array(out)


def evaluate_set(M, thr_a, thr_b, ks=(3, 5)):
    """-> dict with per-method metrics + ranking@k, calibration and per-kind accuracy of the full pipeline."""
    X, y, groups, kinds = M["X"], M["y"], M["groups"], M["kinds"]
    probs = np.array([scorer.probability(dict(zip(FEATURE_NAMES, x))) for x in X])
    thr = scorer.threshold()
    full = full_pipeline(M, probs)
    sa, sb = X[:, COL["global_sim"]], X[:, COL["req_exact"]]
    methods = {
        "A cosine-only": (sa, (sa >= thr_a).astype(int)),
        "B keyword overlap": (sb, (sb >= thr_b).astype(int)),
        "ours: model": (probs, (probs >= thr).astype(int)),
        "ours: full pipeline": (probs, full),
    }
    out = {"n": int(len(y)), "eligible": int(y.sum()), "roles": int(len(set(groups.tolist()))), "methods": {}}
    for name, (score, pred) in methods.items():
        m = metrics(y, pred, score)
        m["ranking"] = {f"k={k}": ranking_metrics(y, score, groups, k=k) for k in ks}
        out["methods"][name] = m
    out["ece"] = calibration_error(y, probs)
    out["by_kind"] = {}
    for k in sorted(set(kinds.tolist())):
        idx = kinds == k
        out["by_kind"][k] = {"n": int(idx.sum()), "accuracy": round(float((full[idx] == y[idx]).mean()), 4),
                             "predicted_eligible": round(float(full[idx].mean()), 3), "truly_eligible": round(float(y[idx].mean()), 3)}
    return out


def print_set(title, res):
    print(f"\n=== {title}: {res['n']} pairs, {res['eligible']} eligible, {res['roles']} roles ===")
    print(f"{'method':22s} {'acc':>6s} {'prec':>6s} {'rec':>6s} {'f1':>6s} {'auc':>6s}")
    for name, m in res["methods"].items():
        print(f"{name:22s} {m['accuracy']:6.3f} {m['precision']:6.3f} {m['recall']:6.3f} {m['f1']:6.3f} {m.get('roc_auc', float('nan')):6.3f}")
    print("per-role ranking (the product ranks candidates):")
    for name, m in res["methods"].items():
        parts = [f"{k}: p@k={r['precision@' + k[2:]]} ndcg={r['ndcg@' + k[2:]]}" for k, r in m["ranking"].items()]
        print(f"  {name:22s} " + " | ".join(parts) + f" | mrr={next(iter(m['ranking'].values()))['mrr']}")
    print(f"calibration error (ECE, lower is better): {res['ece']}")
    for k, v in res["by_kind"].items():
        print(f"  {k:18s} n={v['n']:4d} acc={v['accuracy']:.3f} predicted-eligible={v['predicted_eligible']:.2f} truly-eligible={v['truly_eligible']:.2f}")


def markdown(report):
    L = [f"# Evaluation of `{report['scorer']}`", "",
         f"- date: {report['date']}  - embedder: `{report['embedder']}`  - model threshold: {report['threshold']}  - beta: {report['beta']}",
         f"- baseline thresholds: A={report['baseline_thresholds']['A']}, B={report['baseline_thresholds']['B']} ({report['baseline_source']})", ""]
    for key, title in (("held_out", "Held-out (role+resume disjoint split of the training data)"), ("gold", "Gold set (hand-labelled, never trained on)")):
        res = report.get(key)
        if not res:
            continue
        L += [f"## {title}", f"{res['n']} pairs, {res['eligible']} eligible, {res['roles']} roles; ECE {res['ece']}", "",
              "| method | accuracy | precision | recall | F1 | ROC-AUC | p@3 | NDCG@3 | p@5 | NDCG@5 | MRR |", "|---|---|---|---|---|---|---|---|---|---|---|"]
        for name, m in res["methods"].items():
            r3, r5 = m["ranking"]["k=3"], m["ranking"]["k=5"]
            L.append(f"| {name} | {m['accuracy']} | {m['precision']} | {m['recall']} | {m['f1']} | {m.get('roc_auc', '-')} | "
                     f"{r3['precision@3']} | {r3['ndcg@3']} | {r5['precision@5']} | {r5['ndcg@5']} | {r5['mrr']} |")
        L += ["", "Full pipeline by candidate type: " + "; ".join(f"{k}: acc {v['accuracy']} (n={v['n']})" for k, v in res["by_kind"].items()), ""]
    return "\n".join(L)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", nargs="*", default=[], help="training files (same list as train.py): gives the held-out split + baseline thresholds")
    ap.add_argument("--gold", default="training/gold/gold_pairs.jsonl")
    ap.add_argument("--no-gold", action="store_true", help="skip the gold set on purpose (otherwise a missing gold file is an error)")
    ap.add_argument("--beta", type=float, default=0.5, help="F-beta used to pick the baselines' thresholds (<1 favours precision)")
    ap.add_argument("--test-frac", type=float, default=0.2)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--report-dir", default="training/reports")
    a = ap.parse_args()

    assert_fair_features(FEATURE_NAMES)
    print(f"embedder={model_name()} scorer={scorer.model_version()} threshold={scorer.threshold()}")
    report = {"scorer": scorer.model_version(), "embedder": model_name(), "threshold": scorer.threshold(), "beta": a.beta,
              "date": dt.date.today().isoformat(), "test_frac": a.test_frac, "seed": a.seed}

    thr_a = thr_b = None
    held = None
    missing = [p for p in a.data if not os.path.exists(p)]
    if missing:
        raise SystemExit(f"training data not found: {missing}  (python -m training.build_real_dataset ...)")
    if not a.no_gold and not os.path.exists(a.gold):
        raise SystemExit(f"gold set not found: {a.gold}  (python -m training.gold.build_gold), or pass --no-gold to skip it on purpose")
    if a.no_gold and not a.data:
        raise SystemExit("nothing to evaluate: --no-gold without --data")
    data_paths = list(a.data)
    if data_paths:
        rows, dropped = drop_gold_overlap(load_rows(*data_paths), a.gold)
        M = build_matrix(rows)
        tr, te = holdout_split(M, a.test_frac, a.seed)
        thr_a, _ = best_threshold(M["y"][tr], M["X"][tr, COL["global_sim"]], a.beta)
        thr_b, _ = best_threshold(M["y"][tr], M["X"][tr, COL["req_exact"]], a.beta)
        sub = {k: v[te] for k, v in M.items()}
        held = evaluate_set(sub, thr_a, thr_b)
        held["gold_rows_dropped"] = dropped
        report["held_out"] = held
        print_set("held-out", held)

    if not a.no_gold:
        G = build_matrix(load_rows(a.gold))
        source = "chosen on the train split"
        if thr_a is None:
            thr_a, _ = best_threshold(G["y"], G["X"][:, COL["global_sim"]], a.beta)
            thr_b, _ = best_threshold(G["y"], G["X"][:, COL["req_exact"]], a.beta)
            source = "oracle: chosen on the gold set itself, no --data given"
        gold = evaluate_set(G, thr_a, thr_b)
        report["gold"] = gold
        report["baseline_source"] = source
        print_set("gold", gold)

    report["baseline_thresholds"] = {"A": thr_a, "B": thr_b}
    report.setdefault("baseline_source", "chosen on the train split")
    os.makedirs(a.report_dir, exist_ok=True)
    stem = os.path.join(a.report_dir, f"eval-{report['scorer']}")
    with open(stem + ".json", "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)
    with open(stem + ".md", "w", encoding="utf-8") as f:
        f.write(markdown(report) + "\n")
    print(f"\nreport -> {stem}.json / .md")


if __name__ == "__main__":
    main()