"""Adds (or replaces) the row of the CURRENT scorer version in training/MODEL_CARD.md.

    python -m training.update_model_card --note "added aliases for react native / flutter; retrained"

Reads app/artifacts/scorer.json and training/reports/eval-<version>.json (run `python -m training.evaluate` first) and writes
one row between the `versions:start/end` markers of the card. Same version twice = row replaced, so it is safe to re-run.
It then also writes your own notebook training/data/MODEL_INFO.md (training/model_info.py: quality in plain words, data stats,
weights, settings used); that file is git-ignored.
"""
import argparse
import json
import os
import re

CARD = os.path.join("training", "MODEL_CARD.md")
START, END = "<!-- versions:start -->", "<!-- versions:end -->"
HEADER = ("| version | date | embedder | threshold | real pairs | held-out AUC / NDCG@5 | gold P / R / AUC | gold NDCG@3 / MRR | notes |\n"
          "|---|---|---|---|---|---|---|---|---|")


def _g(d, *path, default="-"):
    for p in path:
        if not isinstance(d, dict) or p not in d:
            return default
        d = d[p]
    return default if d is None else d


def build_row(scorer_json, report, note):
    held, gold = report.get("held_out"), report.get("gold")
    h = _g(held, "methods", "ours: full pipeline")
    g = _g(gold, "methods", "ours: full pipeline")
    held_s = f"{_g(h, 'roc_auc')} / {_g(h, 'ranking', 'k=5', 'ndcg@5')}" if held else "-"
    gold_s = f"{_g(g, 'precision')} / {_g(g, 'recall')} / {_g(g, 'roc_auc')}" if gold else "-"
    gold_r = f"{_g(g, 'ranking', 'k=3', 'ndcg@3')} / {_g(g, 'ranking', 'k=3', 'mrr')}" if gold else "-"
    n_real = _g(scorer_json, "metrics", "n_real_pairs")
    return (f"| {scorer_json['version']} | {report.get('date', '-')} | {scorer_json.get('embedding_model')} | {scorer_json.get('threshold')} | "
            f"{n_real} | {held_s} | {gold_s} | {gold_r} | {note.replace('|', '/')} |")


def update(card_text, row, version):
    if START not in card_text or END not in card_text:
        raise SystemExit(f"{CARD} has no {START} / {END} markers")
    head, rest = card_text.split(START, 1)
    body, tail = rest.split(END, 1)
    rows = [ln for ln in body.strip().splitlines() if ln.startswith("|") and not ln.startswith("| version") and not ln.startswith("|---")]
    rows = [ln for ln in rows if not re.match(rf"\|\s*{re.escape(version)}\s*\|", ln)]
    rows.append(row)
    return head + START + "\n" + HEADER + "\n" + "\n".join(rows) + "\n" + END + tail


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--note", default="")
    ap.add_argument("--scorer", default=os.path.join("app", "artifacts", "scorer.json"))
    ap.add_argument("--reports", default=os.path.join("training", "reports"))
    a = ap.parse_args()
    with open(a.scorer, encoding="utf-8") as f:
        sc = json.load(f)
    rp = os.path.join(a.reports, f"eval-{sc['version']}.json")
    if not os.path.exists(rp):
        raise SystemExit(f"{rp} not found - run `python -m training.evaluate --data ...` for this scorer first")
    with open(rp, encoding="utf-8") as f:
        report = json.load(f)
    with open(CARD, encoding="utf-8") as f:
        text = f.read()
    with open(CARD, "w", encoding="utf-8") as f:
        f.write(update(text, build_row(sc, report, a.note), sc["version"]))
    print(f"{CARD}: version {sc['version']} recorded")
    try:
        from training import model_info
        out, _ = model_info.write(a.note, a.scorer, a.reports)
        print(f"{out}: version {sc['version']} recorded")
    except SystemExit as exc:        # the notebook is a bonus: never fail the card because of it
        print(f"MODEL_INFO.md not written: {exc}")


if __name__ == "__main__":
    main()