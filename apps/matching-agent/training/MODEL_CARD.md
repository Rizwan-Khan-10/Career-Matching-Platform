# Model card — eligibility scorer (`app/artifacts/scorer.json`)

## What it is
A logistic model over 17 semantic features (14 base + `is_fresher_role`, `project_evidence`, `has_internship`; `app/services/features.py`) that returns P(candidate is eligible for the role).
The agent publishes a pair as **eligible** only if `P >= threshold` **and** no hard gate fails (required-skill coverage below
`MIN_REQUIRED_SKILL_COVERAGE`, experience far below the minimum; campus rules are separate gates). The decision uses no LLM.
Weights are sign-constrained (`training/bounded_logreg.py`): every quality feature has a weight >= 0, so more evidence never lowers the score (`has_req_skills` and `is_fresher_role` are flags and may take either sign). The experience gate is off for fresher/any roles; campus rules are separate gates and are not part of the model.
Used for: ranking and filtering **tech** resumes against **tech** roles of the same track/stack, fresher and experienced.
Not for: non-tech roles, ranking people by anything other than fit to a stated role, or any automatic rejection (the applicant and the company always decide).

## Data
| Source | Use | Notes |
|---|---|---|
| Hugging Face `cnamuangtoun/resume-job-description-fit` (~8k pairs; check its licence on the dataset page) | training + held-out | raw text parsed by Groq `openai/gpt-oss-120b` with the same prompts as the production parsers (`training/build_real_dataset.py`); Good Fit → 1, No Fit → 0, **Potential Fit dropped** |
| Recruiter decisions (`scripts/export_real_labels.py`) | training (weight 5) | shortlisted → 1, rejected → 0; only candidates who approved sharing, so biased toward positives |
| Gold set `training/gold/gold_pairs.jsonl` | **evaluation only** | 200 hand-labelled pairs, 20 roles x 10 resumes, 100 fresher + 100 experienced, never trained on |

Filters: tech roles and tech resumes only (`training/tech_filter.py`: >= 3 tech skills, or a tech-looking title + 1 tech skill; a clearly non-tech title blocks the skills route; `--keep-non-tech` switches it off). Aliases: `app/services/skills.py` (hand-written tech aliases) + optional ESCO aliases from `training/build_aliases.py --tech-only`. Rows carry the production fields: role `level/track/stacks` + campus rules, resume `branch/passingYear/backlogs`.
Fairness: no feature uses name, gender, photo or institution (`training/fairness.py`; institution is stripped from `education` before features are computed).
Split: role-wise AND resume-wise (`training/common.py: split_disjoint`), `--test-frac 0.2 --seed 7`; the gold set shares no role or resume with training data (enforced by `train.py`).

## Metrics
Per version, held-out (training-data split) and gold: see the table below; full reports in `training/reports/eval-<version>.{json,md}`.
Reported: accuracy, precision, recall, F1, ROC-AUC, expected calibration error, per-role precision@k, NDCG@k, MRR, against two baselines
(cosine-only, keyword overlap). The threshold is picked for precision (`--beta 0.5`): a wrongly "eligible" candidate costs more than a missed one.

## Versions
Every retrain adds a row (`python -m training.update_model_card --note "..."` after `train` and `evaluate`).
<!-- versions:start -->
| version | date | embedder | threshold | real pairs | held-out AUC / NDCG@5 | gold P / R / AUC | gold NDCG@3 / MRR | notes |
|---|---|---|---|---|---|---|---|---|
| lr-2026-10-07-n6000 | 2026-10-07 | all-MiniLM-L6-v2 | 0.5 | 0 | 0.9337 / - | - / - / - | - / - | retired bootstrap model: 6000 synthetic pairs, held-out numbers are on synthetic data and not comparable; had negative weights |
<!-- versions:end -->

## Known weaknesses
- **Label quality.** The public dataset's labels are not recruiter decisions on your roles; "Potential Fit" is dropped, so the model sees few borderline cases and is least reliable exactly there.
- **Gold set is small and was drafted by one person** (200 pairs, 20 roles): differences of a few points are noise; confidence intervals are wide, especially for roles with one or two eligible candidates. Review every label as a team.
- **Skill vocabulary.** Skills that are not in the aliases (`app/services/skills.py`, ESCO aliases) rely on embedding similarity only; new frameworks and Indian-market tools can be under-credited. Use `training/error_analysis.py` to find alias candidates.
- **English only**, 384-dim `all-MiniLM-L6-v2` (reads ~256 tokens of profile text; long resumes are truncated by `profile_text.py`).
- **Institution still in live embeddings.** Training strips it, but `profile_text.py` embeds the full `education` string in production. Remove it in all three agent copies and run `scripts/backfill_embeddings.py --rematch` to align training and serving.
- **Feature ramps** (`SKILL_LO/HI`, `EVID_LO/HI`) are hand-set constants, not learned.
- **Recruiter labels are positive-biased** (only approved candidates are judged), so retraining on them alone would push the model towards "eligible".
- **Fresher vs experienced** are served by one model (fresher roles use the three level features; until a scorer trained with them is deployed, `scorer.py` applies interim hand-set nudges `FRESHER_PROJECT_WEIGHT` / `FRESHER_INTERNSHIP_WEIGHT`, shown as the `+fresher-interim` suffix of the version); the per-kind accuracy in the evaluation report shows where it is weaker.

## Retrain
```bash
cd apps/matching-agent
pip install -r requirements-train.txt
python -m training.build_real_dataset --out training/data/real_pairs.jsonl      # GROQ_API_KEY; cached, safe to re-run
python -m scripts.export_real_labels --out training/data/recruiter_labels.jsonl # optional, needs DATABASE_URL
python -m training.train --real training/data/real_pairs.jsonl training/data/recruiter_labels.jsonl \
       --recruiter training/data/recruiter_labels.jsonl --beta 0.5
python -m training.evaluate --data training/data/real_pairs.jsonl training/data/recruiter_labels.jsonl --beta 0.5
python -m training.error_analysis                       # gold-set mistakes -> alias / gate fixes -> train + evaluate again
python -m training.update_model_card --note "what changed"
```
Then restart the agent and open `GET /model` (new version, threshold, metrics). Commit `scorer.json`, `training/reports/`, `MODEL_CARD.md`.
Embedder switch: `python -m training.compare_embedders ...`; if you switch, set `EMBEDDING_MODEL_NAME`, retrain, then `python -m scripts.backfill_embeddings --rematch`.
After changing aliases or `profile_text.py`: retrain AND run the backfill (vectors and features both change).