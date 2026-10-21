# Model notebook

One section per trained version, newest first. Written by `python -m training.model_info` (it runs by itself at the end of `training.update_model_card`). Not committed (training/data is git-ignored).
How to read it: **gold** = 200 hand-labelled pairs the model never saw, this is the number to trust. **held-out** = a slice of the training data, only useful when it is large.

<!-- run:blr-2026-10-20-real2069 -->
## blr-2026-10-20-real2069

- evaluated: 2026-10-21  |  embedder: `all-MiniLM-L6-v2`  |  threshold: **0.5**
- note: real2069, threshold 0.40, review band 0.10, level-aware verdicts

### What the numbers say
- On the gold set the full pipeline has precision 0.8298, recall 0.7091, F1 0.7647 (best baseline: B keyword overlap with F1 0.4867).
- Ranking is WEAKER than a simple baseline: NDCG@3 0.8522 vs 0.9883 (B keyword overlap). It decides eligible / not eligible better than it orders candidates.
- Probabilities are not well calibrated (ECE 0.198): treat the score as a ranking, not as a percentage chance.
- The held-out set has only 86 pairs, so its numbers are noise. Trust the gold set.
- Only 14 fresher roles in the training data: the model learned almost nothing about fresher jobs, the hand-set FRESHER_* weights do that work.
- Few distinct documents (250 resumes, 130 jobs): many pairs reuse the same people and jobs.

### Gold set (hand-labelled, never trained on): 200 pairs, 55 eligible, 20 roles, ECE 0.198

| method | accuracy | precision | recall | F1 | ROC-AUC | NDCG@3 | MRR |
|---|---|---|---|---|---|---|---|
| A cosine-only | 0.28 | 0.2764 | 1.0 | 0.4331 | 0.9419 | 0.9413 | 1.0 |
| B keyword overlap | 0.42 | 0.3216 | 1.0 | 0.4867 | 0.9606 | 0.9883 | 1.0 |
| ours: model | 0.875 | 0.8125 | 0.7091 | 0.7573 | 0.9011 | 0.8522 | 0.975 |
| ours: full pipeline | 0.88 | 0.8298 | 0.7091 | 0.7647 | 0.9011 | 0.8522 | 0.975 |

Full pipeline by candidate type:

- gold-experienced: accuracy 0.94 on 100 pairs, says eligible 21%, truth 23%
- gold-fresher: accuracy 0.82 on 100 pairs, says eligible 26%, truth 32%

### Held-out slice of the training data: 86 pairs, 36 eligible, 22 roles, ECE 0.0921

| method | accuracy | precision | recall | F1 | ROC-AUC | NDCG@3 | MRR |
|---|---|---|---|---|---|---|---|
| A cosine-only | 0.4651 | 0.4359 | 0.9444 | 0.5965 | 0.5617 | 0.7522 | 0.8095 |
| B keyword overlap | 0.5 | 0.434 | 0.6389 | 0.5169 | 0.5597 | 0.5838 | 0.7024 |
| ours: model | 0.6395 | 0.5556 | 0.6944 | 0.6173 | 0.6667 | 0.7575 | 0.8512 |
| ours: full pipeline | 0.6163 | 0.5882 | 0.2778 | 0.3774 | 0.6667 | 0.7575 | 0.8512 |

Full pipeline by candidate type:

- hf_fit: accuracy 0.6163 on 86 pairs, says eligible 20%, truth 42%

### Training data
- pairs: **2069** (887 good fit = 43%, 1182 no fit)
- distinct resumes: 250, distinct jobs: 130, average required skills per job: 9.5
- job level: {'experienced': 1896, 'any': 159, 'fresher': 14}
- job track: {'backend': 636, 'data_ml': 594, 'fullstack': 571, 'devops_cloud': 138, 'other': 64, 'frontend': 45, 'qa': 21}
- campus rules set on jobs: {'allowedBranches': 6}
- resumes that have branch / passingYear / backlogs / cgpa: {'branch': 1840, 'passingYear': 1553, 'backlogs': 0, 'cgpa': 534}
- parse cache `openai_gpt-oss-120b`: 641 resumes + 350 jobs parsed (0 found empty)
- split: role+resume disjoint, test fraction 0.2, seed 7; train 1355, held-out 86, unused 628
- gold rows removed from training: 0; data fingerprint `a8e9ee77f6c6`

### The model

- chosen C = 3.0, beta = 0.5, cross-validated F-beta = 0.6162, bias = -2.3567

| feature | weight |
|---|---|
| exp_over | +1.639 |
| title_sim | +1.390 |
| has_internship | +0.725 |
| req_exact | +0.387 |
| req_mid_frac | +0.214 |
| is_fresher_role | +0.136 |
| edu_score | +0.033 |
| req_hi_frac | +0.009 |
| req_cov | +0.000 |
| req_sem_mean | +0.000 |
| req_sem_min | +0.000 |
| req_ev_mean | +0.000 |
| pref_cov | +0.000 |
| global_sim | +0.000 |
| exp_score | +0.000 |
| has_req_skills | +0.000 |
| project_evidence | +0.000 |

### Settings used for the evaluation (recorded by `training.evaluate` for this version)

- MIN_REQUIRED_SKILL_COVERAGE = 0.35
- EXPERIENCE_GATE_RATIO = 0.5
- EXPERIENCE_GATE_MIN_GAP_YEARS = 1.0
- FRESHER_PROJECT_WEIGHT = 0.6
- FRESHER_INTERNSHIP_WEIGHT = 0.3
- ELIGIBILITY_THRESHOLD = 0.4
- FRESHER_ELIGIBILITY_THRESHOLD = None
- REVIEW_BAND_WIDTH = 0.1
- OVERQUALIFIED_EXTRA_YEARS = 5.0
- MIN_PUBLISH_SCORE = 0.2

### Files

- model: app/artifacts/scorer.json (version blr-2026-10-20-real2069)
- full reports: training/reports/eval-blr-2026-10-20-real2069.json / .md
<!-- /run -->

