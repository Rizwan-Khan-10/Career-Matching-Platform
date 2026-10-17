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

## Real dataset (Hugging Face, tech only)  — task 2.9
`training/build_real_dataset.py` turns `cnamuangtoun/resume-job-description-fit` (Good Fit / No Fit; Potential Fit is dropped) into the
same structured shape the live parser agents produce. Needs `GROQ_API_KEY` (every unique resume / JD is parsed once and cached).
```bash
python -m training.build_real_dataset --max-resumes 300 --max-jds 300     # first run: cheap, prints the tech-only stats
python -m training.build_real_dataset                                      # full run (cached parses are reused, safe to stop and resume)
```
* **Tech filter** (`training/tech_filter.py`, title + skills list): a pair is kept only when its resume AND its job are technical
  (>= 3 tech skills, or a tech-looking title + 1 tech skill; a clearly non-tech title blocks the skills route). `--keep-non-tech` turns it off.
  Stats printed after every run: pairs, label balance, unique resumes/jobs, level, track, rules set, academic fields present.
* Rows now carry `level / track / stacks` and the campus rules on the role, and `branch / passingYear / backlogs` on the resume.
  The parse caches are `*.v2.jsonl`; older caches (without those fields) are ignored.
* **Licence:** check the licence on the dataset card before any use beyond internal training. `training/data/` is git-ignored: never commit
  raw text or generated files, only `scorer.json`.

### Skill aliases
Hand-written tech aliases (frameworks, cloud, data/ML, DevOps, QA) are in `app/services/skills.py` (`ALIASES`); they always win.
Optional ESCO aliases: `python -m training.build_aliases --esco <skills_en.csv> --tech-only` (writes `app/artifacts/skill_aliases.json`).
After changing aliases: `python -m scripts.backfill_embeddings --rematch` and retrain (profile text changes).

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