# Gold set

`gold_pairs.jsonl` - 200 hand-labelled (resume, role) pairs used ONLY for testing (`python -m training.evaluate`).

- 20 roles x 10 resumes; 100 `gold-fresher` + 100 `gold-experienced`; 55 eligible / 145 not eligible.
- Tracks: backend (Java, Python, .NET, Go), frontend, full-stack, mobile (Android, iOS), data/ML, DevOps/cloud, QA.
- Label 1 = a recruiter would treat the candidate as eligible for the role (required skills covered, experience level fits,
  right track/stack); 0 = not eligible (wrong stack, missing must-have skills, too little experience, other field).
- Row format = training rows: `group` = role (ranking per role), `split_group` = resume, `kind` = gold-fresher|gold-experienced.
- No names, genders, photos or institutions in any resume.

Rules: never train on it (train.py refuses it and drops overlapping roles/resumes); do not tune thresholds on it.
Edit labels in `build_gold.py` (`LABELS`), run `python -m training.gold.build_gold`, review the diff of both files together.
The first version of the labels was drafted by one person: the team should review every pair once and flip what it disagrees with.

Every role carries `level` (fresher | experienced), `track` and `stacks`; the gold set is scored WITHOUT the compatibility gate, so cross-track pairs (e.g. an iOS resume against a Java role) are deliberate easy negatives for the scorer itself.