# matching-agent

Decides which resumes are eligible for which job roles. **No LLM in the decision** (deterministic, explainable,
immune to prompt injection inside resumes).

```
resume.confirmed / resume.updated ─┐   compatibility gate (track + stack, SQL)
profile.updated (academic rules) ──┼─> retrieve (pgvector) ─> features ─> scorer + gates ─> match.computed ─> matching-results-service
jd.extracted (new/edited role) ────┤
resume.deleted ────────────────────┘
job.role.deleted -> drop the role's vector
(resume.parsed is NOT consumed: parsing is not matching - only confirmed, non-superseded resumes take part)
```

| file | job |
|---|---|
| `services/profile_text.py` | structured text that is embedded (same builder on resume + role side) |
| `services/features.py` | per-skill semantic similarity -> 14 features |
| `services/scorer.py` | logistic model (`artifacts/scorer.json`) + hard gates |
| `services/rules.py` | campus rules (`minCgpa, allowedBranches, passingYears, maxBacklogs`), effective-value rule, role level |
| `services/academic.py` | read-only SQL: `users_service.ApplicantProfile` academic columns |
| `services/matcher.py` | one resume x one role -> score, eligible, reason, matched/missing skills |
| `services/compatibility.py` | target-role gate (contract §4.11) in Python + SQL form, active-resume SQL |
| `services/vector_search.py` | paged best-first retrieval with pgvector (cosine, HNSW), gate applied in SQL first; RoleScan hash reads |
| `services/retrieval.py` | best-first batch loop with early stop, best resume per applicant, optional prefilter |
| `services/input_hash.py` | `inputHash` (contract §4.12) - unchanged (resume, role) pairs are never re-scored |
| `services/side_cache.py` | LRU caches of the prepared resume side / role side (`SIDE_CACHE_SIZE`) |
| `services/run_stats.py` | per-run counters, served by `GET /stats` |
| `taxonomy/tech_roles.json` | copy of the target-role taxonomy (3 identical copies, see below) |
| `workers/stream_consumer.py` | Redis stream handlers |
| `training/` | dataset generator, training, evaluation (see `training/README.md`) |
|`core/redis_stream.py` | consume loop: retry, reclaim idle messages, dead-letter; `publish` adds `MAXLEN ~ 10000` + `requestId` |
| `core/health_state.py` | consumer registry read by `/health` |
| `core/security.py` | `x-internal-key` check |
| `core/logging_setup.py` | JSON logs |
| `scripts/` | `backfill_embeddings.py`, `export_real_labels.py`, `check_taxonomy.py` |

Run tests: `EMBEDDING_BACKEND=hash python -m unittest discover -s tests -t . -v` (hash = offline stand-in, tests logic only).
**No silent fallback:** with `EMBEDDING_BACKEND=minilm` a missing / invalid / mismatching `app/artifacts/scorer.json` stops the agent at start-up with a clear `ScorerError`. The hand-set `TEST_MODEL` and the `hash` embedder exist only for unit tests / CI (`EMBEDDING_BACKEND=hash`); `hash` is refused when `APP_ENV=production`.
`GET /model` shows the live scorer/threshold/embedder. `GET /stats` shows per-run efficiency counters. Tunables are env vars, see `app/core/config.py`.

## Efficient matching (contract §8)
1. **Gate first** - track/stack compatibility is in the SQL `WHERE`, before the similarity ordering.
2. **Best first, stop early** - candidates come in pages of `BATCH_SIZE` (25) ordered by cosine similarity; the loop stops after
   `EARLY_STOP_EMPTY_BATCHES` (2) consecutive batches with no eligible pair, at `MAX_ELIGIBLE_PER_ROLE` (200) eligible pairs, or at `TOP_K_*`.
3. **Skip unchanged pairs** - `inputHash` is compared with `matches_service."RoleScan"."inputHash"`; equal -> no scoring, no event
   (they still count towards early stop through their stored result). `resume.deleted` ignores the hashes on purpose. If the column
   does not exist yet, nothing is skipped (always correct, just slower).
4. **Caches** - prepared resume side / role side in an in-process LRU (`SIDE_CACHE_SIZE`, default 2000 per side). Keys contain a content hash, so edits are never served stale.
5. **Best resume per (applicant, role)** - all evaluated pairs go to `match.scanned`, only the best resume per applicant is published as `match.computed`.
6. **Prefilter (`PREFILTER_MIN_COSINE`) is OFF by default.** Turn it on only after the gold-set evaluation shows recall falls by <= 1 point.
7. **`GET /stats`** - per run: `retrieved, gatedOut, prefiltered, skippedByHash, scored, eligible, stoppedBy, ms`; totals; cache hits/misses.

| env | default | meaning |
|---|---|---|
| `BATCH_SIZE` | 25 | candidates scored per batch |
| `EARLY_STOP_EMPTY_BATCHES` | 2 | consecutive batches without an eligible pair before stopping |
| `MAX_ELIGIBLE_PER_ROLE` | 200 | stop after this many eligible pairs in one run |
| `SIDE_CACHE_SIZE` | 2000 | LRU entries per side (resume / role) |
| `PREFILTER_MIN_COSINE` | unset (off) | cheap prefilter threshold |

Taxonomy copies: `apps/resume-service/src/taxonomy/tech-roles.json` (owner), `apps/jd-extractor-agent/app/taxonomy/tech_roles.json`
and `app/taxonomy/tech_roles.json` here must be identical. Check: `python -m scripts.check_taxonomy` (also runs inside the unit tests).

## Campus rules (hard gates)
Role requirements may carry `minCgpa`, `allowedBranches[]`, `passingYears[]`, `maxBacklogs`. **Absent / null / empty = rule not set**
(`maxBacklogs: 0` *is* a rule; `minCgpa: 0` asks nothing).
Applicant value = contract 4.3: **verified** (`academicVerified` profile) > **resume** (the resume being scored) > **self** (profile). CGPA > 10 is a percentage (/10).

| value | result |
|---|---|
| known, rule holds | pass |
| known, rule broken | **hard gate**: not eligible, reason names the rule, listed in `breakdown.gatesFailed` (score never above threshold) |
| unknown | **never fails**: pair stays eligible, field name goes to `unverifiedRules` (`cgpa, branch, passingYear, backlogs`), `reason` ends with e.g. "CGPA not verified." |

Branches are compared alias-aware after normalising (`CSE` = `B.Tech in Computer Science & Engineering` = `Computer Science`); the table is `_BRANCH_ALIASES` in `rules.py`.
`breakdown.rules` has per rule `required / value / source / status` (passed | failed | unverified).
Input hash: `rules.academic_hash_part(req, parsed, profile)` returns the effective values the role's rules used (None when the role has no rule).

## Role level (decision)
| `level` | experience gate | `exp_score` / `exp_over` | extra features |
|---|---|---|---|
| `experienced` | on (soft ratio rule, see below) | real ratio | `is_fresher_role = project_evidence = has_internship = 0` -> scoring identical to before |
| `fresher`, `any` | soft ratio rule **off** (company band and strict minimum still apply) | neutral: `exp_score = 1.0`, `exp_over = 0` | `is_fresher_role = 1`, `project_evidence` (share of required skills backed by projects/experience text), `has_internship` |
| missing / invalid | same as `experienced` (old roles keep behaving as before) | | |

`any` is treated like `fresher` (the spec groups them). For fresher/any roles the soft ratio rule is off; the company's experience band below still applies.

## Company experience band and verdicts
The company sets, per role (job-service `requirements`): `minExperienceYears` (default 0), `maxExperienceYears` (empty = no upper limit; ignored when below the minimum) and `strictMinExperience`. Implemented in `app/services/experience.py`, applied in `scorer.judge()`.
| situation | result |
|---|---|
| experience above the max | hard gate: not eligible (reason names the limit) |
| below the minimum and `strictMinExperience` | hard gate: not eligible |
| below the minimum, not strict, `experienced` role | soft rule: only a big shortfall (ratio `EXPERIENCE_GATE_RATIO`, gap >= `EXPERIENCE_GATE_MIN_GAP_YEARS`) fails |
| candidate experience unknown | never rejected; flagged `unverified`; an `eligible` result is downgraded one step to `review` when the role asks about experience |
| much more than the minimum, max empty | only a recruiter note (`OVERQUALIFIED_EXTRA_YEARS`), never changes verdict or score |

Role salary fields are never scored and are left out of `inputHash` (changing a salary does not re-score anything).

Resume `experienceYears` counts work only: internship / trainee entries are left out (resume-parser-agent).

**Verdict** (`eligible | review | not_eligible`, `MatchResult.verdict`, published in `match.computed` and `match.scanned`):
- hard gates fail -> `not_eligible` (never `review`);
- probability >= threshold -> `eligible` (`eligible = true` only here);
- `threshold - REVIEW_BAND_WIDTH <= probability < threshold` -> `review` (a *possible match*; the applicant may still share the resume, the company reviews it);
- otherwise `not_eligible`. The score is kept consistent with the verdict order.
`FRESHER_ELIGIBILITY_THRESHOLD` (optional) sets a separate bar for fresher/any roles. The policy values (thresholds, band width, gates, ratios) are part of `inputHash`, so changing one re-scores every pair once.
The three new features are appended to `FEATURE_NAMES`. A `scorer.json` trained on the 14 base features still loads; for the new features it uses **interim** weights
`FRESHER_PROJECT_WEIGHT` (0.6) and `FRESHER_INTERNSHIP_WEIGHT` (0.3) (logit units, `0` switches them off) and `modelVersion` gets the suffix `+fresher-interim`.
After retraining with the new features (task 2.10) the trained weights are used and the suffix disappears.


## Port
8003 (suggested): `uvicorn app.main:app --port 8003`

## Routes
| method | path | role | notes |
|---|---|---|---|
| GET | `/health` (also `/`) | none | 200 `ok`; **503 `degraded`** when startup failed or a consumer thread died (`errors` lists which) |
| GET | `/model` | internal | live scorer version, threshold, embedder, metrics |
| GET | `/stats` | internal | per-run efficiency counters + totals + cache hit rates |
| GET | `/docs` | none | only when `ENABLE_DOCS=true` |

"internal" = header `x-internal-key: $INTERNAL_API_KEY` (check skipped when the variable is unset). Agents are never exposed by nginx.

## Events
| stream | direction | payload |
|---|---|---|
| `resume.confirmed` | consumed | `{ resumeId, applicantId, targetTrack, targetStack }` |
| `resume.updated` | consumed | parsed resume fields, only for confirmed resumes |
| `profile.updated` | consumed | `{ applicantId }` |
| `jd.extracted` | consumed | `{ jobPostingId, companyId, roleIds }` |
| `job.role.deleted` | consumed | `{ roleId }` |
| `resume.deleted` | consumed | `{ resumeId, applicantId }` |
| `match.computed` | produced | applicantId, jobRoleId, roleTitle, resumeId, score, eligible, reason, skills, `unverifiedRules`, breakdown, modelVersion |
| `match.scanned` | produced | `{ scans: [{ jobRoleId, applicantId, resumeId, eligible, score, inputHash }] }` (chunked) |

Consumer group `matching-agent-group`. Every `XADD` uses `MAXLEN ~ 10000`. The `requestId` of an incoming event is copied into every event published because of it, otherwise one new id is created per message. Idle pending messages are reclaimed, retried 4 times, then moved to `<stream>.dead`.

## Database
Reads `resumes_service."Resume"`, `jobs_service."JobRole"` / `"JobPosting"`, `matches_service."RoleScan"`, `users_service."ApplicantProfile"` (read-only). Owns `resume_embeddings` and `job_role_embeddings` (created at start-up).

## Environment variables
| name | required | default / example | meaning |
|---|---|---|---|
| `PORT` | no | `8000` (suggested `8003`) | port (use the same in the uvicorn command) |
| `DATABASE_URL` | yes | `postgresql://user:pass@localhost:5432/db` | Postgres with pgvector |
| `REDIS_URL` | no | `redis://localhost:6379` | Redis streams |
| `INTERNAL_API_KEY` | no | `change-me` | required in `x-internal-key` for every route except health/docs; unset = no check |
| `EMBEDDING_BACKEND` | no | `minilm` | `minilm` real model; `hash` offline stand-in for tests/CI only |
| `EMBEDDING_MODEL_NAME` | no | `all-MiniLM-L6-v2` | sentence-transformers model |
| `SCORER_PATH` | no | `app/artifacts/scorer.json` | trained scorer file |
| `ELIGIBILITY_THRESHOLD` | no | unset (trained one; the shipped model trained at 0.5) | serving bar. Set `0.40` (compose does) |
| `FRESHER_ELIGIBILITY_THRESHOLD` | no | unset (= same bar) | separate bar for fresher/any roles |
| `REVIEW_BAND_WIDTH` | no | `0.10` | width of the *possible match* band below the bar (0 = off) |
| `MAX_REVIEW_PER_RESUME` / `MAX_REVIEW_PER_ROLE` | no | `20` | max possible-match pairs published per run (eligible ones are never capped) |
| `OVERQUALIFIED_EXTRA_YEARS` | no | `5` | years above the minimum before the recruiter note appears |
| `MIN_REQUIRED_SKILL_COVERAGE` | no | `0.35` | gate: required-skill coverage below this = not eligible |
| `EXPERIENCE_GATE_RATIO` | no | `0.5` | gate: experience below ratio x minimum ... |
| `EXPERIENCE_GATE_MIN_GAP_YEARS` | no | `1` | ... and gap at least this many years |
| `APP_ENV` | no | unset | `production` makes the agent refuse `EMBEDDING_BACKEND=hash` at start-up |
| `FRESHER_PROJECT_WEIGHT` | no | `0.6` | interim projects nudge for fresher/any roles (0 = off) |
| `FRESHER_INTERNSHIP_WEIGHT` | no | `0.3` | interim internship nudge for fresher/any roles (0 = off) |
| `TOP_K_ROLES_PER_RESUME` | no | `50` | max roles kept for one resume |
| `TOP_K_RESUMES_PER_ROLE` | no | `100` | max resumes kept for one role |
| `BATCH_SIZE` | no | `25` | candidates scored per batch (best first) |
| `EARLY_STOP_EMPTY_BATCHES` | no | `2` | consecutive batches without an eligible pair before stopping |
| `MAX_ELIGIBLE_PER_ROLE` | no | `200` | stop once this many eligible pairs were found in a run |
| `SIDE_CACHE_SIZE` | no | `2000` | LRU entries per side (resume / role) |
| `PREFILTER_MIN_COSINE` | no | unset (off) | cheap prefilter threshold; enable only after the gold-set recall check |
| `MAX_INELIGIBLE_PER_RESUME` | no | `5` | near-misses published per resume |
| `MAX_INELIGIBLE_PER_ROLE` | no | `5` | near-misses published per role |
| `MIN_PUBLISH_SCORE` | no | `0.20` | minimum score for a published near-miss |
| `LOG_LEVEL` | no | `INFO` | JSON logs: `ts, level, service, requestId, msg` |
| `ENABLE_DOCS` | no | `false` | `/docs` only when `true` |
| `ENABLE_MATCHING_CONSUMER` | no | `true` | run the stream consumers |

## Run locally
```
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --port 8003
```

## Docker
`docker build -t matching-agent apps/matching-agent` (context = this folder). The embedding model is downloaded at build time; `app/artifacts/` is read-only inside the image (compose also mounts it `:ro`). Container port 8000.

## Depends on
Postgres (pgvector), Redis, resume-service (confirmed resumes, taxonomy), jd-extractor-agent (roles), user-service (academic data), matching-results-service (consumes `match.computed` / `match.scanned`).