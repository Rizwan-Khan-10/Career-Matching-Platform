"""Fails (exit 1) when the three copies of the target-role taxonomy differ (contract §4.10).

    python -m scripts.check_taxonomy            # run from apps/matching-agent
    python -m scripts.check_taxonomy --root ../..   # explicit repo root

Copies (resume-service is the owner of the file; the two agents keep an identical copy):
  apps/resume-service/src/taxonomy/tech-roles.json
  apps/jd-extractor-agent/app/taxonomy/tech_roles.json
  apps/matching-agent/app/taxonomy/tech_roles.json
JSON content is compared, so only formatting (spaces / line breaks) may differ.
"""
import argparse
import json
import os
import sys

COPIES = [
    "apps/resume-service/src/taxonomy/tech-roles.json",
    "apps/jd-extractor-agent/app/taxonomy/tech_roles.json",
    "apps/matching-agent/app/taxonomy/tech_roles.json",
]
DEFAULT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))


def check(root: str = DEFAULT_ROOT) -> list[str]:
    """Returns a list of problems (empty = all copies identical)."""
    docs, problems = {}, []
    for rel in COPIES:
        path = os.path.join(root, rel)
        try:
            with open(path, encoding="utf-8") as f:
                docs[rel] = json.load(f)
        except FileNotFoundError:
            problems.append(f"missing: {rel}")
        except ValueError as exc:
            problems.append(f"invalid JSON: {rel} ({exc})")
    if docs:
        base_rel = COPIES[0] if COPIES[0] in docs else next(iter(docs))
        for rel, doc in docs.items():
            if doc != docs[base_rel]:
                problems.append(f"differs from {base_rel}: {rel}")
    return problems


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=DEFAULT_ROOT, help="repository root (default: auto-detected)")
    problems = check(os.path.abspath(ap.parse_args(argv).root))
    for p in problems:
        print(f"TAXONOMY MISMATCH - {p}", file=sys.stderr)
    if not problems:
        print(f"taxonomy OK: {len(COPIES)} copies identical")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())