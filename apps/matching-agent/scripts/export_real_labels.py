"""Turns recruiter decisions (Shortlist / Reject buttons) into REAL training labels.

    python -m scripts.export_real_labels --out training/data/real_labels.jsonl
    python -m training.train --extra training/data/real_labels.jsonl
    python -m training.evaluate --data training/data/dataset.jsonl training/data/real_labels.jsonl

shortlisted -> label 1, rejected -> label 0. The resume used is the one the match was computed on
(Match.resumeId), the role is read as it is now. Only candidates who APPROVED sharing can be judged by a
recruiter, so these labels cover approved candidates only (rejected ones are the model's false positives).
"""
import argparse
import json
from collections import Counter

from app.core.db import get_conn


def _j(v):
    return json.loads(v) if isinstance(v, str) else (v or {})


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="training/data/real_labels.jsonl")
    a = ap.parse_args()

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("""
            SELECT m."jobRoleId", m."applicantId", m.decision, m.eligible, m.score, jr.title, jr.requirements, r."parsedData"
            FROM "matches_service"."Match" m
            JOIN "jobs_service"."JobRole" jr ON jr.id = m."jobRoleId"
            JOIN "resumes_service"."Resume" r ON r.id = m."resumeId"
            WHERE m.decision IN ('shortlisted', 'rejected')
        """)
        rows = cur.fetchall()

    stats = Counter()
    with open(a.out, "w", encoding="utf-8") as f:
        for role_id, applicant, decision, model_eligible, score, title, req, parsed in rows:
            label = 1 if decision == "shortlisted" else 0
            stats[(("model eligible" if model_eligible else "model near-miss"), decision)] += 1
            f.write(json.dumps({
                "group": role_id, "label": label, "kind": "real", "modelScoreAtDecision": score,
                "role": {"title": title, "requirements": _j(req)}, "resume": _j(parsed),
            }) + "\n")
    print(f"exported {len(rows)} labelled pairs to {a.out}")
    for (who, decision), n in sorted(stats.items()):
        print(f"  {who:15s} -> {decision:11s}: {n}")
    if len(rows) < 100:
        print("note: <100 real labels is too few to retrain on their own; they are mixed into the synthetic set with 3x weight.")


if __name__ == "__main__":
    main()