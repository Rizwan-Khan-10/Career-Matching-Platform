"""Builds app/artifacts/skill_aliases.json from the ESCO skills file (replaces guessing aliases by hand).

    # download the ESCO dataset (CSV, English) from the ESCO portal, unzip, then:
    python -m training.build_aliases --esco <path>/skills_en.csv

alias -> canonical, all lowercase.  Rules (conservative on purpose):
  * canonical = ESCO preferred label without a trailing "(...)" qualifier ("Python (computer programming)" -> "python")
  * the hand-written ALIASES in app/services/skills.py ALWAYS win, and canonicals are routed through them
  * an alias that points to more than one canonical is dropped (ambiguous)
  * an alias that is itself another skill's preferred label is dropped
  * 1-char, numeric-only and > 5-word aliases are dropped
  * --tech-only: keep only aliases whose canonical is a tech skill (training/tech_filter.py), so the file stays small
    and relevant for a tech-jobs platform. Hand-written tech aliases (frameworks, cloud, data/ML, DevOps, QA) live in
    app/services/skills.py and always win over ESCO.
After changing aliases: re-run  python -m scripts.backfill_embeddings --rematch  and retrain (profile text changes).
"""
import argparse
import csv
import json
import os
import re
from collections import defaultdict

from app.services.skills import HAND_ALIASES as HAND   # hand-written map only, so re-running never treats old ESCO aliases as hand-written

OUT = os.path.join("app", "artifacts", "skill_aliases.json")
_PAREN = re.compile(r"\s*\([^)]*\)\s*$")
_WS = re.compile(r"\s+")


def clean(label):
    s = _WS.sub(" ", _PAREN.sub("", str(label or "")).strip().lower())
    return s if 0 < len(s) <= 60 else ""


def _col(header, *needles):
    for h in header:
        if all(n in h.lower() for n in needles):
            return h
    return None


def build(rows, header, hand, keep=None):
    """keep: optional set of canonical skills; when given, only aliases that point to one of them are returned."""
    pref, alts = _col(header, "preferred"), _col(header, "alt")
    if not pref or not alts:
        raise SystemExit(f"could not find preferred/alt label columns in {header}")
    preferred, a2c = set(), defaultdict(set)
    for r in rows:
        canon = clean(r.get(pref))
        if not canon:
            continue
        canon = hand.get(canon, canon)
        preferred.add(canon)
        for alt in str(r.get(alts) or "").split("\n"):
            a = clean(alt)
            if a and a != canon:
                a2c[a].add(canon)
    out = {}
    for a, cs in a2c.items():
        if len(cs) != 1 or a in hand or a in preferred or len(a) < 2 or a.isdigit() or len(a.split()) > 5:
            continue
        canon = next(iter(cs))
        if keep is not None and canon not in keep:
            continue
        out[a] = canon
    return dict(sorted(out.items()))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--esco", required=True, help="path to skills_en.csv")
    ap.add_argument("--tech-only", action="store_true", help="keep only aliases of tech skills")
    a = ap.parse_args()
    with open(a.esco, encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        rows = list(reader)
        header = reader.fieldnames or []
    keep = None
    if a.tech_only:
        from training.tech_filter import TECH_SKILLS
        keep = TECH_SKILLS
    aliases = build(rows, header, HAND, keep)
    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump(aliases, f, indent=0, ensure_ascii=False)
    print(f"{len(rows)} ESCO skills -> {len(aliases)} aliases written to {a.out}" + (" (tech only)" if a.tech_only else ""))
    print(f"hand-written aliases (always win): {len(HAND)}")


if __name__ == "__main__":
    main()