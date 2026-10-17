"""Trains and evaluates the scorer once per embedding model on the SAME data and prints a side-by-side table.

    python -m training.compare_embedders --data training/data/real_pairs.jsonl training/data/recruiter_labels.jsonl \
        --models all-MiniLM-L6-v2 BAAI/bge-small-en-v1.5 thenlper/gte-small

Only 384-dimensional models fit the existing pgvector columns (vector(384)). Each model runs in its own process
(EMBEDDING_MODEL_NAME) with its own temp scorer file: app/artifacts/scorer.json is NOT touched.
Columns: held-out (training-data split) and gold set (hand-labelled, never trained on), both from training.evaluate.
Report: training/reports/embedders-<date>.md.

If you SWITCH (decision rule printed below):
  1. set EMBEDDING_MODEL_NAME=<model> in the agent's env (and in resume-parser / jd-extractor, which embed too)
  2. python -m training.train ...  (writes the scorer for that embedder; scorer.py refuses a scorer from another embedder)
  3. python -m training.evaluate ... ; python -m training.update_model_card --note "embedder -> <model>"
  4. python -m scripts.backfill_embeddings --rematch   (re-embeds ACTIVE resumes + roles, then re-scores them)
"""
import argparse
import datetime as dt
import glob
import json
import os
import subprocess
import sys
import tempfile

DIM = 384


def _run(args, env):
    r = subprocess.run([sys.executable, "-m", *args], env=env, capture_output=True, text=True)
    if r.returncode != 0:
        print(f"FAILED {' '.join(args[:2])}:\n{(r.stdout + r.stderr)[-1500:]}")
        return False
    return True


def check_dim(model):
    from sentence_transformers import SentenceTransformer
    d = SentenceTransformer(model).get_sentence_embedding_dimension()
    if d != DIM:
        raise SystemExit(f"{model} outputs {d}-dim vectors; the pgvector columns are vector({DIM})")


def run_one(model, data, gold, beta, test_frac, seed):
    tmp = tempfile.mkdtemp(prefix="embcmp_")
    scorer_path = os.path.join(tmp, "scorer.json")
    env = dict(os.environ, EMBEDDING_MODEL_NAME=model, SCORER_PATH=scorer_path)
    common = ["--test-frac", str(test_frac), "--seed", str(seed)]
    if not _run(["training.train", "--real", *data, "--out", scorer_path, "--beta", str(beta), *common], env):
        return None
    reports = os.path.join(tmp, "reports")
    if not _run(["training.evaluate", "--data", *data, "--gold", gold, "--beta", str(beta), "--report-dir", reports, *common], env):
        return None
    with open(glob.glob(os.path.join(reports, "eval-*.json"))[0], encoding="utf-8") as f:
        return json.load(f)


def row(model, rep):
    h = rep.get("held_out", {}).get("methods", {}).get("ours: full pipeline", {})
    g = rep.get("gold", {}).get("methods", {}).get("ours: full pipeline", {})
    return {"model": model,
            "held_auc": h.get("roc_auc"), "held_ndcg5": h.get("ranking", {}).get("k=5", {}).get("ndcg@5"),
            "gold_auc": g.get("roc_auc"), "gold_ndcg3": g.get("ranking", {}).get("k=3", {}).get("ndcg@3"),
            "gold_prec": g.get("precision"), "gold_rec": g.get("recall"), "ece": rep.get("held_out", {}).get("ece")}


def table(rows):
    cols = ["held_auc", "held_ndcg5", "gold_auc", "gold_ndcg3", "gold_prec", "gold_rec", "ece"]
    lines = [f"{'model':32s} " + " ".join(f"{c:>10s}" for c in cols)]
    for r in rows:
        lines.append(f"{r['model']:32s} " + " ".join(f"{str(r[c]):>10s}" for c in cols))
    return "\n".join(lines)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", nargs="+", required=True)
    ap.add_argument("--models", nargs="+", default=["all-MiniLM-L6-v2", "BAAI/bge-small-en-v1.5"])
    ap.add_argument("--gold", default="training/gold/gold_pairs.jsonl")
    ap.add_argument("--beta", type=float, default=0.5)
    ap.add_argument("--test-frac", type=float, default=0.2)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--report-dir", default="training/reports")
    ap.add_argument("--skip-dim-check", action="store_true")
    a = ap.parse_args()

    rows = []
    for m in a.models:
        print(f"== {m} ...", flush=True)
        if not a.skip_dim_check:
            check_dim(m)
        rep = run_one(m, a.data, a.gold, a.beta, a.test_frac, a.seed)
        if rep:
            rows.append(row(m, rep))
    if not rows:
        raise SystemExit("no model finished")

    text = table(rows)
    rule = ("Rule of thumb: switch only if the challenger wins on held-out NDCG@5 AND ROC-AUC by > ~0.02 on >= 300 held-out pairs "
            "AND does not lose on the gold set; smaller gaps are noise. Lower ece = better calibration. A switch means retrain + "
            "`python -m scripts.backfill_embeddings --rematch`.")
    print("\n" + text + "\n\n" + rule)
    os.makedirs(a.report_dir, exist_ok=True)
    path = os.path.join(a.report_dir, f"embedders-{dt.date.today().isoformat()}.md")
    with open(path, "w", encoding="utf-8") as f:
        f.write(f"# Embedder comparison {dt.date.today().isoformat()}\n\nbeta={a.beta}, test_frac={a.test_frac}, seed={a.seed}\n\n```\n{text}\n```\n\n{rule}\n")
    print(f"-> {path}")


if __name__ == "__main__":
    main()