"""Trains the scorer once per embedding model on the SAME real pairs and prints a side-by-side table.

    python -m training.compare_embedders --data training/data/real_pairs.jsonl \
        --models all-MiniLM-L6-v2 BAAI/bge-small-en-v1.5 thenlper/gte-small

Only 384-dimensional models fit the existing pgvector columns (vector(384)). Each model is trained in its own
process (EMBEDDING_MODEL_NAME) and writes to a temp file - app/artifacts/scorer.json is NOT touched.
The first run downloads each model, and embedding ~8k pairs on CPU can take a while per model.
"""
import argparse
import json
import os
import subprocess
import sys
import tempfile


def run_one(model, data, extra):
    out = os.path.join(tempfile.gettempdir(), "scorer_" + model.replace("/", "_") + ".json")
    env = dict(os.environ, EMBEDDING_MODEL_NAME=model)
    cmd = [sys.executable, "-m", "training.train", "--real", *data, "--out", out, *extra]
    r = subprocess.run(cmd, env=env, capture_output=True, text=True)
    if r.returncode != 0:
        print(f"[{model}] FAILED:\n{(r.stdout + r.stderr)[-1500:]}")
        return None
    with open(out, encoding="utf-8") as f:
        return json.load(f)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", nargs="+", required=True)
    ap.add_argument("--models", nargs="+", default=["all-MiniLM-L6-v2", "BAAI/bge-small-en-v1.5"])
    ap.add_argument("--beta", default="0.5")
    a = ap.parse_args()

    results = {}
    for m in a.models:
        print(f"== training with {m} ...", flush=True)
        art = run_one(m, a.data, ["--beta", a.beta])
        if art:
            results[m] = art["metrics"]["held_out_real"]

    print(f"\n{'model':32s} {'n':>5s} {'auc':>6s} {'prec':>6s} {'recall':>6s} {'ece':>6s} {'ndcg@5':>7s} {'mrr':>6s}")
    for m, h in results.items():
        rk = h.get("ranking", {})
        print(f"{m:32s} {h['n']:>5} {h['roc_auc']:>6} {h['precision']:>6} {h['recall']:>6} {h['ece']:>6} {str(rk.get('ndcg@5')):>7s} {str(rk.get('mrr')):>6s}")
    print("\nRule of thumb: switch only if the new model wins on ndcg@5 AND auc by > ~0.02 on >= 300 held-out pairs; "
          "smaller gaps are noise. Higher ece = worse calibration (lower is better).")


if __name__ == "__main__":
    main()