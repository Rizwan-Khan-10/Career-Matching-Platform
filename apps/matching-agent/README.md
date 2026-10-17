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
| `scripts/` | `backfill_embeddings.py`, `export_real_labels.py` |
| `scripts/` | `backfill_embeddings.py`, `export_real_labels.py`, `check_taxonomy.py` |

Run tests: `EMBEDDING_BACKEND=hash python -m unittest discover -s tests -t . -v` (hash = offline stand-in, tests logic only).
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