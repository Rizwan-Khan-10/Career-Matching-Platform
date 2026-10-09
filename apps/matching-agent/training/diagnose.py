"""Shows WHY the model says "eligible" for pairs the ground truth says are NOT (false positives).

    python -m training.diagnose

For each sampled false positive it prints the role, the resume and, per required skill, how much credit the
embedding gave and from which resume skill. Paste the output when tuning (SKILL_LO / SKILL_HI in features.py).
"""
import random

from training.common import load_rows
from app.services.matcher import evaluate_match

rows = load_rows("training/data/dataset.jsonl")
random.seed(1)
negatives = [r for r in rows if r["kind"] in ("partial", "same_domain") and r["label"] == 0]
sample = random.sample(negatives, min(600, len(negatives)))

bad = []
for r in sample:
    res = evaluate_match(r["resume"], r["role"]["title"], r["role"]["requirements"])
    if res.eligible:
        bad.append((r, res))

print(f"{len(bad)} false positives out of {len(sample)} sampled negatives (partial + same_domain)\n")
for r, res in random.sample(bad, min(8, len(bad))):
    req = r["role"]["requirements"]
    print("ROLE  :", req["requiredSkills"], "| min exp", req["minExperienceYears"], "| qual", req["qualifications"])
    print("RESUME:", r["resume"]["skills"], "| exp", r["resume"]["experienceYears"], "| edu", r["resume"]["education"])
    print("TRUTH coverage:", r["truth_coverage"], "-> model score", res.score)
    for s in res.breakdown["skills"]:
        print(f"   {s['skill']:28s} credit={s['credit']:.2f} via={s['via']:9s} sim={s['similarity']:.2f} matched_with={s['matchedWith']}")
    print()