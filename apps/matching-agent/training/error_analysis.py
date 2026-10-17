"""Lists every gold-set mistake of the deployed scorer and says what probably caused it.

    python -m training.error_analysis                 # uses training/gold/gold_pairs.jsonl and app/artifacts/scorer.json

For each false positive / false negative of the FULL pipeline (model + hard gates) it prints the probability, the gates that
fired, the key features, the required skills that were NOT matched exactly (with the closest resume skill and its cosine),
and a hint:
  * alias candidate : a required skill that is only "semantic" / "evidence" matched with a high cosine -> add a hand alias in
                      app/services/skills.py (then retrain: profile text and features change)
  * gate too strict : a false negative that a hard gate vetoed -> check MIN_REQUIRED_SKILL_COVERAGE / experience gate
  * gate missing    : a false positive with a clear gap (coverage < 0.6 or experience far below the minimum)
  * model           : none of the above -> more / better training data, or features
Output: stdout and training/reports/errors-<scorer version>.md. Fix aliases/gates, retrain, evaluate, and record the new
version in MODEL_CARD.md (training/update_model_card.py).
"""
import argparse
import os
import numpy as np

from app.core.embeddings import model_name
from app.services import scorer
from app.services.features import FEATURE_NAMES, build_resume_side, compute_features
from training.common import load_rows
from training.fairness import sanitise_resume

SHOW = ("req_cov", "req_exact", "global_sim", "exp_score", "edu_score")


def analyse(rows):
    """-> list of dicts, one per mistake (empty when the pipeline is perfect on these rows)."""
    thr = scorer.threshold()
    out = []
    for r in rows:
        resume = sanitise_resume(r["resume"])
        res = compute_features(resume, r["role"]["title"], r["role"]["requirements"], side=build_resume_side(resume))
        prob = scorer.probability(res.features)
        gates = scorer.apply_gates(res.features, res.detail)
        pred = int(prob >= thr and not gates)
        if pred == int(r["label"]):
            continue
        unmatched = [c for c in res.detail["required"] if not c["exact"]]
        aliases = [c for c in unmatched if c["via"] in ("semantic", "evidence") and c["similarity"] >= 0.6]
        if pred == 0 and gates and prob >= thr:
            hint = "gate too strict (model said eligible, a hard gate vetoed it)"
        elif pred == 0 and aliases:
            hint = "alias candidate: " + ", ".join(f"{c['skill']} ~ {c['matchedWith']} ({c['similarity']:.2f})" for c in aliases)
        elif pred == 1 and (res.features["req_cov"] < 0.6 or (res.detail["minExperienceYears"] and (res.detail["experienceYears"] or 0) < 0.6 * res.detail["minExperienceYears"])):
            hint = "gate missing: clear gap in required skills or experience"
        else:
            hint = "model: features look reasonable, needs better data/features"
        out.append({"kind": "false positive" if pred == 1 else "false negative", "role": r["role"]["title"], "role_id": r["group"],
                    "resume_id": r.get("split_group"), "resume_title": r["resume"].get("currentTitle"), "prob": round(prob, 3), "threshold": thr,
                    "gates": gates, "features": {k: round(res.features[k], 3) for k in SHOW},
                    "unmatched": [(c["skill"], c["via"], c["matchedWith"], c["similarity"]) for c in unmatched], "hint": hint})
    return out


def markdown(version, errors, n):
    L = [f"# Gold-set errors of `{version}`", "", f"embedder `{model_name()}`, {len(errors)} errors on {n} pairs", ""]
    for e in sorted(errors, key=lambda e: (e["kind"], e["role_id"])):
        L += [f"## {e['kind']}: {e['role']} <- {e['resume_title']} ({e['role_id']} / {e['resume_id']})",
              f"- probability {e['prob']} (threshold {e['threshold']}), gates: {e['gates'] or 'none'}",
              "- features: " + ", ".join(f"{k}={v}" for k, v in e["features"].items()),
              "- required skills not matched exactly: " + ("; ".join(f"{s} [{via}: {w} {sim}]" for s, via, w, sim in e["unmatched"]) or "none"),
              f"- hint: {e['hint']}", ""]
    return "\n".join(L)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--gold", default="training/gold/gold_pairs.jsonl")
    ap.add_argument("--report-dir", default="training/reports")
    a = ap.parse_args()
    rows = load_rows(a.gold)
    errors = analyse(rows)
    version = scorer.model_version()
    text = markdown(version, errors, len(rows))
    print(text)
    fp = sum(e["kind"] == "false positive" for e in errors)
    print(f"summary: {fp} false positives, {len(errors) - fp} false negatives, hints: " +
          ", ".join(f"{h}={sum(e['hint'].startswith(h) for e in errors)}" for h in ("alias", "gate too", "gate missing", "model")))
    os.makedirs(a.report_dir, exist_ok=True)
    path = os.path.join(a.report_dir, f"errors-{version}.md")
    with open(path, "w", encoding="utf-8") as f:
        f.write(text + "\n")
    print(f"-> {path}")


if __name__ == "__main__":
    main()