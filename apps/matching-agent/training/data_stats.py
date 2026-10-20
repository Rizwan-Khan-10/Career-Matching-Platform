"""Counts fresher vs experienced in a pairs file (no API calls).

    python -m training.data_stats                                  # training/data/real_pairs.jsonl
    python -m training.data_stats --data training/gold/gold_pairs.jsonl
"""
import argparse
import json
from collections import Counter

BUCKETS = ("0 yrs", "<1 yr", "1-3 yrs", "3+ yrs", "unknown")


def exp_bucket(years):
    if years is None:
        return "unknown"
    if years <= 0:
        return "0 yrs"
    if years < 1:
        return "<1 yr"
    return "1-3 yrs" if years < 3 else "3+ yrs"


def summarize(rows):
    """-> dict with counts per role level, per candidate-experience bucket, and level x bucket with positives."""
    out = {"n": len(rows), "level": Counter(), "level_pos": Counter(), "bucket": Counter(), "cross": {}}
    for r in rows:
        lvl = (r.get("role", {}).get("requirements") or r.get("role") or {}).get("level") or "any"
        b = exp_bucket(r.get("resume", {}).get("experienceYears"))
        out["level"][lvl] += 1
        out["level_pos"][lvl] += int(r["label"])
        out["bucket"][b] += 1
        cell = out["cross"].setdefault((lvl, b), [0, 0])
        cell[0] += 1
        cell[1] += int(r["label"])
    return out


def show(s):
    n = s["n"]
    print(f"pairs={n}")
    print("\nrole level (n, % positive):")
    for lvl, c in s["level"].most_common():
        print(f"  {lvl:12s} {c:5d} ({c / n:.0%})  positive {s['level_pos'][lvl] / c:.0%}")
    print("\ncandidate experience:")
    for b in BUCKETS:
        if s["bucket"][b]:
            print(f"  {b:8s} {s['bucket'][b]:5d} ({s['bucket'][b] / n:.0%})")
    print("\nrole level x candidate experience -> pairs / positive%:")
    print("  " + "level".ljust(12) + "".join(b.rjust(14) for b in BUCKETS))
    for lvl in sorted(s["level"]):
        cells = []
        for b in BUCKETS:
            t, p = s["cross"].get((lvl, b), [0, 0])
            cells.append((f"{t} / {p / t:.0%}" if t else "-").rjust(14))
        print("  " + lvl.ljust(12) + "".join(cells))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default="training/data/real_pairs.jsonl")
    a = ap.parse_args()
    with open(a.data, encoding="utf-8") as f:
        rows = [json.loads(line) for line in f if line.strip()]
    show(summarize(rows))


if __name__ == "__main__":
    main()
