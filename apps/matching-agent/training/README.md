# Training the matching scorer

The agent decides eligibility with a small logistic model on **semantic features** (embedding similarity of every
required skill to the candidate's skills/projects/experience, global resume<->JD similarity, title similarity,
experience, education). Nothing is keyword matching; nothing is decided by an LLM.

python -m training.build_real_dataset --out training/data/real_pairs.jsonl     # needs GROQ_API_KEY; parses with openai/gpt-oss-120b (--model to change)
python -m training.train --real training/data/real_pairs.jsonl                  # -> app/artifacts/scorer.json
python -m training.evaluate --data training/data/real_pairs.jsonl --beta 0.5    # held-out + gold set -> training/reports/

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

## Gold set (`training/gold/`)
200 hand-labelled (resume, role) pairs: 20 roles x 10 resumes, 100 fresher + 100 experienced, tracks backend, frontend,
fullstack, mobile, data/ML, DevOps, QA. Labels live in `gold/build_gold.py` (`LABELS` table); fix a label there and run
`python -m training.gold.build_gold` to rewrite `gold_pairs.jsonl`. **Only `evaluate.py` reads it.** `train.py` refuses
gold files/rows and drops any training row that shares a role or a resume with the gold set. Details: `gold/README.md`.

## Split
The held-out split is role-wise AND resume-wise (`common.split_disjoint`): a pair is held-out only when its role and
its resume are both held-out; pairs that mix sides are unused. `train.py` and `evaluate.py` share it
(`--test-frac 0.2 --seed 7`; pass the same values to both).

## Metrics (`evaluate.py`, report in `training/reports/eval-<version>.{json,md}`)
Per-role precision@k, NDCG@k (k=3,5), MRR, plus accuracy / precision / recall / F1 / ROC-AUC and ECE, for
A cosine-only, B keyword overlap, ours (model) and ours (full pipeline with hard gates), on held-out and on gold.
`--beta` (default 0.5) picks the baselines' thresholds, and `train.py --beta` picks the scorer's, favouring precision.

## Fairness
No feature uses name, gender, photo or institution (`training/fairness.py`: feature-name check, sanitised resume, institution
removed from `education`). Known follow-up: `app/services/profile_text.py` still embeds the full `education` string in
production; remove the institution there (all three agent copies, then `backfill_embeddings.py --rematch`) to match training.

## Adding recruiter labels
Recruiters use the **Shortlist / Reject** buttons on the company's candidates page (only applicants who approved sharing
appear there, so labels come from approved candidates and are biased toward positives). Then:

```bash
python -m scripts.export_real_labels --out training/data/recruiter_labels.jsonl
python -m training.train --real training/data/real_pairs.jsonl training/data/recruiter_labels.jsonl \
                         --recruiter training/data/recruiter_labels.jsonl --recruiter-weight 5
```

Manual format (jsonl, one pair per line):

```json
{"group":"role-uuid","split_group":"resume-uuid","label":1,"role":{"title":"Backend Developer","requirements":{"requiredSkills":["Node.js"],"preferredSkills":[],"minExperienceYears":2,"qualifications":"B.Tech"}},"resume":{"skills":["Node","MongoDB"],"projects":[],"experience":[],"experienceYears":3,"education":"B.Tech"}}
```
`group` = role id (ranking is per role), `split_group` = resume id (defaults to `group`); the held-out split keeps both apart.

## After training: improve, then record the version
```bash
python -m training.error_analysis        # every gold-set mistake with a hint (alias / gate / model)
# fix aliases (app/services/skills.py) or gates, retrain, evaluate again
python -m training.update_model_card --note "what changed"
python -m training.compare_embedders --data training/data/real_pairs.jsonl   # optional; a switch needs scripts.backfill_embeddings --rematch
```
`training/llm_client.py` (Groq, model pinned to `openai/gpt-oss-120b`, `GROQ_MODEL` is ignored) is used only by `build_real_dataset.py`; the agent itself never calls an LLM.

## Knobs (env)
`ELIGIBILITY_THRESHOLD`, `MIN_REQUIRED_SKILL_COVERAGE`, `EXPERIENCE_GATE_RATIO`, `MAX_INELIGIBLE_PER_RESUME`, `TOP_K_*`.
Use `--beta 0.5` in train.py to favour precision (fewer wrongly-eligible candidates).