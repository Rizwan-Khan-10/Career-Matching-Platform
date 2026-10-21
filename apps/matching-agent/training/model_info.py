"""Writes ONE readable file about the trained model: training/data/MODEL_INFO.md

    python -m training.model_info --note "what changed"        # also runs at the end of update_model_card

For every trained version it records, in plain words: how good it is (gold + held-out), what data it was trained on,
the model itself (threshold, weights), and the settings used when it was evaluated. Newest version on top, older ones below.
Same version twice = its section is replaced, so it is safe to re-run. training/data/ is git-ignored on purpose:
this file is your own notebook, it is not committed (the committed record is MODEL_CARD.md + training/reports/).

Reads: app/artifacts/scorer.json, training/reports/eval-<version>.json (run `training.evaluate` first),
       training/data/real_pairs.jsonl (+ recruiter_labels.jsonl if present), training/data/.parse_cache/*.
"""
import argparse
import glob
import json
import os
import re
from collections import Counter

DEFAULT_OUT = os.path.join("training", "data", "MODEL_INFO.md")
DEFAULT_DATA = [os.path.join("training", "data", "real_pairs.jsonl"), os.path.join("training", "data", "recruiter_labels.jsonl")]
CACHE_ROOT = os.path.join("training", "data", ".parse_cache")

HEADER = ("# Model notebook\n\n"
          "One section per trained version, newest first. Written by `python -m training.model_info` "
          "(it runs by itself at the end of `training.update_model_card`). Not committed (training/data is git-ignored).\n"
          "How to read it: **gold** = 200 hand-labelled pairs the model never saw, this is the number to trust. "
          "**held-out** = a slice of the training data, only useful when it is large.\n\n")
START = "<!-- run:{v} -->"
END = "<!-- /run -->"


def _read_json(path):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def load_rows(paths):
    rows = []
    for p in paths:
        if not os.path.exists(p):
            continue
        with open(p, encoding="utf-8") as f:
            rows += [json.loads(line) for line in f if line.strip()]
    return rows


def dataset_stats(rows):
    """Same numbers build_real_dataset prints, kept as data."""
    n = len(rows)
    if not n:
        return None
    reqs = [(r.get("role") or {}).get("requirements") or {} for r in rows]
    pos = sum(int(r.get("label", 0)) for r in rows)
    return {
        "pairs": n, "positives": pos, "negatives": n - pos,
        "resumes": len({r.get("split_group") for r in rows}), "jobs": len({r.get("group") for r in rows}),
        "level": dict(Counter(q.get("level", "any") for q in reqs)),
        "track": dict(Counter(q.get("track", "other") for q in reqs).most_common()),
        "rules": dict(Counter(k for q in reqs for k in ("minCgpa", "allowedBranches", "passingYears", "maxBacklogs") if q.get(k) is not None)),
        "resume_fields": {k: sum(1 for r in rows if (r.get("resume") or {}).get(k) is not None) for k in ("branch", "passingYear", "backlogs", "cgpa")},
        "avg_required_skills": round(sum(len(q.get("requiredSkills") or []) for q in reqs) / n, 1),
        "kinds": dict(Counter(r.get("kind", "?") for r in rows)),
    }


def cache_stats(root=CACHE_ROOT):
    """{parse model: {resumes: n, jds: n, empty: n}} from the append-only parse caches."""
    out = {}
    for d in sorted(glob.glob(os.path.join(root, "*"))):
        info = {"resumes": 0, "jds": 0, "empty": 0}
        for kind in ("resumes", "jds"):
            path = os.path.join(d, f"{kind}.v2.jsonl")
            if not os.path.exists(path):
                continue
            with open(path, encoding="utf-8") as f:
                for line in f:
                    try:
                        rec = json.loads(line)
                    except ValueError:
                        continue
                    info[kind] += 1
                    info["empty"] += int(len(rec) > 2 and rec[1] is None)
        if info["resumes"] or info["jds"]:
            out[os.path.basename(d)] = info
    return out


def _ours(res):
    return (res or {}).get("methods", {}).get("ours: full pipeline")


def _best_baseline(res, key):
    vals = [((res["methods"].get(n) or {}).get("ranking", {}).get("k=3", {}).get(key), n) for n in ("A cosine-only", "B keyword overlap")]
    vals = [(v, n) for v, n in vals if v is not None]
    return max(vals) if vals else (None, None)


def verdict(sc, report, stats):
    """Plain-language findings. Facts only: they say what the numbers show, not whether to ship."""
    notes = []
    gold, held = report.get("gold"), report.get("held_out")
    o = _ours(gold)
    if o:
        base = max(((gold["methods"][n].get("f1", 0), n) for n in ("A cosine-only", "B keyword overlap") if n in gold["methods"]), default=(None, None))
        line = f"On the gold set the full pipeline has precision {o['precision']}, recall {o['recall']}, F1 {o['f1']}"
        if base[0] is not None:
            line += f" (best baseline: {base[1]} with F1 {base[0]})"
        notes.append(line + ".")
        nd, who = _best_baseline(gold, "ndcg@3")
        ours_nd = (o.get("ranking", {}).get("k=3") or {}).get("ndcg@3")
        if nd is not None and ours_nd is not None:
            if ours_nd + 0.02 < nd:
                notes.append(f"Ranking is WEAKER than a simple baseline: NDCG@3 {ours_nd} vs {nd} ({who}). It decides eligible / not eligible better than it orders candidates.")
            else:
                notes.append(f"Ranking is at least as good as the baselines: NDCG@3 {ours_nd} vs {nd} ({who}).")
        for kind, v in (gold.get("by_kind") or {}).items():
            gap = v["predicted_eligible"] - v["truly_eligible"]
            if gap > 0.15:
                notes.append(f"Too generous for '{kind}': it calls {v['predicted_eligible']:.0%} eligible, the truth is {v['truly_eligible']:.0%} (accuracy {v['accuracy']}).")
            elif gap < -0.15:
                notes.append(f"Too strict for '{kind}': it calls {v['predicted_eligible']:.0%} eligible, the truth is {v['truly_eligible']:.0%} (accuracy {v['accuracy']}).")
        if gold.get("ece", 0) > 0.15:
            notes.append(f"Probabilities are not well calibrated (ECE {gold['ece']}): treat the score as a ranking, not as a percentage chance.")
    else:
        notes.append("No gold-set result in the evaluation report: run `training.evaluate` with the gold set to judge this model.")
    if held and held.get("n", 0) < 100:
        notes.append(f"The held-out set has only {held['n']} pairs, so its numbers are noise. Trust the gold set.")
    if stats:
        fresher = stats["level"].get("fresher", 0)
        if fresher < 20:
            notes.append(f"Only {fresher} fresher roles in the training data: the model learned almost nothing about fresher jobs, the hand-set FRESHER_* weights do that work.")
        if stats["pairs"] < 300:
            notes.append(f"Only {stats['pairs']} training pairs (< 300): the metrics are unreliable.")
        if stats["resumes"] < 200 or stats["jobs"] < 200:
            notes.append(f"Few distinct documents ({stats['resumes']} resumes, {stats['jobs']} jobs): many pairs reuse the same people and jobs.")
    return notes


def _knobs(report):
    cfg = report.get("config")
    if cfg:
        return cfg, "recorded by `training.evaluate` for this version"
    try:
        from app.core import config as c
        names = ("MIN_REQUIRED_SKILL_COVERAGE", "EXPERIENCE_GATE_RATIO", "EXPERIENCE_GATE_MIN_GAP_YEARS",
                 "FRESHER_PROJECT_WEIGHT", "FRESHER_INTERNSHIP_WEIGHT", "ELIGIBILITY_THRESHOLD",
                 "FRESHER_ELIGIBILITY_THRESHOLD", "REVIEW_BAND_WIDTH", "OVERQUALIFIED_EXTRA_YEARS", "MIN_PUBLISH_SCORE")
        return {n: getattr(c, n) for n in names}, "read from this shell now (the report did not record them; re-run `training.evaluate` to record)"
    except Exception:       # noqa: BLE001 - info only
        return {}, "not available"


def _methods_table(res):
    L = ["| method | accuracy | precision | recall | F1 | ROC-AUC | NDCG@3 | MRR |", "|---|---|---|---|---|---|---|---|"]
    for name, m in res["methods"].items():
        r3 = (m.get("ranking") or {}).get("k=3", {})
        L.append(f"| {name} | {m['accuracy']} | {m['precision']} | {m['recall']} | {m['f1']} | {m.get('roc_auc', '-')} | {r3.get('ndcg@3', '-')} | {r3.get('mrr', '-')} |")
    return L


def render(sc, report, stats, caches, note, recruiter_pairs=0):
    m = sc.get("metrics") or {}
    L = [f"## {sc['version']}", "",
         f"- evaluated: {report.get('date', '-')}  |  embedder: `{sc.get('embedding_model')}`  |  threshold: **{sc.get('threshold')}**",
         f"- note: {note or '-'}", "", "### What the numbers say"]
    L += [f"- {x}" for x in verdict(sc, report, stats)]
    for key, title in (("gold", "Gold set (hand-labelled, never trained on)"), ("held_out", "Held-out slice of the training data")):
        res = report.get(key)
        if not res:
            continue
        L += ["", f"### {title}: {res['n']} pairs, {res['eligible']} eligible, {res['roles']} roles, ECE {res['ece']}", ""] + _methods_table(res)
        kinds = res.get("by_kind") or {}
        if kinds:
            L += ["", "Full pipeline by candidate type:", ""] + [
                f"- {k}: accuracy {v['accuracy']} on {v['n']} pairs, says eligible {v['predicted_eligible']:.0%}, truth {v['truly_eligible']:.0%}" for k, v in kinds.items()]
    L += ["", "### Training data"]
    if stats:
        L += [f"- pairs: **{stats['pairs']}** ({stats['positives']} good fit = {stats['positives'] / stats['pairs']:.0%}, {stats['negatives']} no fit)",
              f"- distinct resumes: {stats['resumes']}, distinct jobs: {stats['jobs']}, average required skills per job: {stats['avg_required_skills']}",
              f"- job level: {stats['level']}", f"- job track: {stats['track']}",
              f"- campus rules set on jobs: {stats['rules'] or 'none'}",
              f"- resumes that have branch / passingYear / backlogs / cgpa: {stats['resume_fields']}"]
        if recruiter_pairs:
            L.append(f"- recruiter decisions used: {recruiter_pairs}")
    else:
        L.append("- training file not found (training/data/real_pairs.jsonl)")
    for model, c in caches.items():
        L.append(f"- parse cache `{model}`: {c['resumes']} resumes + {c['jds']} jobs parsed ({c['empty']} found empty)")
    split = m.get("split") or {}
    L += [f"- split: {split.get('mode', '-')}, test fraction {split.get('test_frac', '-')}, seed {split.get('seed', '-')}; "
          f"train {split.get('train', '-')}, held-out {split.get('held_out', '-')}, unused {split.get('unused', '-')}",
          f"- gold rows removed from training: {m.get('gold_rows_dropped_from_training', '-')}; data fingerprint `{m.get('data_fingerprint', '-')}`"]
    L += ["", "### The model", "",
          f"- chosen C = {m.get('C', '-')}, beta = {m.get('beta', '-')}, cross-validated F-beta = {m.get('cv_f_beta', '-')}, bias = {sc.get('bias')}",
          "", "| feature | weight |", "|---|---|"]
    for name, w in sorted((sc.get("weights") or {}).items(), key=lambda kv: -abs(kv[1])):
        L.append(f"| {name} | {w:+.3f} |")
    knobs, how = _knobs(report)
    L += ["", f"### Settings used for the evaluation ({how})", ""]
    L += [f"- {k} = {v}" for k, v in knobs.items()] or ["- (none recorded)"]
    L += ["", "### Files", "", f"- model: app/artifacts/scorer.json (version {sc['version']})",
          f"- full reports: training/reports/eval-{sc['version']}.json / .md", ""]
    return "\n".join(L)


def upsert(text, version, section):
    """Newest first; the same version replaces its old section."""
    block = START.format(v=version) + "\n" + section.rstrip() + "\n" + END + "\n\n"
    if not text.strip():
        text = HEADER
    pattern = re.compile(re.escape(START.format(v=version)) + r".*?" + re.escape(END) + r"\n*", re.S)
    text = pattern.sub("", text)
    head, sep, rest = text.partition("<!-- run:")
    return head.rstrip() + "\n\n" + block + (sep + rest if sep else "")


def write(note="", scorer_path=os.path.join("app", "artifacts", "scorer.json"), reports_dir=os.path.join("training", "reports"),
          data=None, out=DEFAULT_OUT, cache_root=CACHE_ROOT):
    sc = _read_json(scorer_path)
    if not sc:
        raise SystemExit(f"{scorer_path} not found or not valid JSON")
    report = _read_json(os.path.join(reports_dir, f"eval-{sc['version']}.json"))
    if report is None:
        raise SystemExit(f"{reports_dir}/eval-{sc['version']}.json not found - run `python -m training.evaluate --data ...` for this scorer first")
    paths = data or DEFAULT_DATA
    rows = load_rows(paths)
    recruiter = len(load_rows([p for p in paths if "recruiter" in os.path.basename(p)]))
    section = render(sc, report, dataset_stats(rows), cache_stats(cache_root), note, recruiter)
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    old = ""
    if os.path.exists(out):
        with open(out, encoding="utf-8") as f:
            old = f.read()
    with open(out, "w", encoding="utf-8") as f:
        f.write(upsert(old, sc["version"], section))
    return out, sc["version"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--note", default="")
    ap.add_argument("--scorer", default=os.path.join("app", "artifacts", "scorer.json"))
    ap.add_argument("--reports", default=os.path.join("training", "reports"))
    ap.add_argument("--data", nargs="*", default=None, help="training files (default: training/data/real_pairs.jsonl and recruiter_labels.jsonl)")
    ap.add_argument("--out", default=DEFAULT_OUT)
    a = ap.parse_args()
    out, version = write(a.note, a.scorer, a.reports, a.data, a.out)
    print(f"{out}: version {version} recorded")


if __name__ == "__main__":
    main()
