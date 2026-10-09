# Training the matching scorer

The agent decides eligibility with a small logistic model on **semantic features** (embedding similarity of every
required skill to the candidate's skills/projects/experience, global resume<->JD similarity, title similarity,
experience, education). Nothing is keyword matching; nothing is decided by an LLM.

```bash
cd apps/matching-agent
pip install -r requirements-train.txt
python -m training.generate_dataset --roles 500          # 6000 labelled pairs (synthetic bootstrap)
python -m training.train                                  # -> app/artifacts/scorer.json
python -m training.evaluate                               # vs cosine-only and keyword baselines (held-out roles)
```
Use the real embedder (default `EMBEDDING_BACKEND=minilm`). Restart the agent, open `GET /model` to confirm.

## Adding REAL labels (this is what makes it "perfect")
The synthetic labels come from a hand-written rule, so the model can at best learn that rule. Real recruiter
decisions teach it your actual hiring bar.

Easiest way: recruiters use the **Shortlist / Reject** buttons on the company's "Candidates ready" page (only
applicants who approved sharing appear there, so labels come from approved candidates). Then:

```bash
python -m scripts.export_real_labels --out training/data/real_labels.jsonl
python -m training.train --extra training/data/real_labels.jsonl
```

Manual format, if you want to add labels from elsewhere (jsonl, one pair per line, e.g. `training/data/real_labels.jsonl`):

```json
{"group":"role-uuid","label":1,"role":{"title":"Backend Developer","requirements":{"requiredSkills":["Node.js"],"preferredSkills":[],"minExperienceYears":2,"qualifications":"B.Tech"}},"resume":{"skills":["Node","MongoDB"],"projects":[],"experience":[],"experienceYears":3,"education":"B.Tech"}}
```
Real rows are weighted 3x. ~300+ real pairs across several roles already moves the model noticeably.
`group` = role id so train/test never share a role.

## Knobs (env)
`ELIGIBILITY_THRESHOLD`, `MIN_REQUIRED_SKILL_COVERAGE`, `EXPERIENCE_GATE_RATIO`, `MAX_INELIGIBLE_PER_RESUME`, `TOP_K_*`.
Use `--beta 0.5` in train.py to favour precision (fewer wrongly-eligible candidates).