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
| `services/vector_search.py` | shortlist candidates with pgvector (cosine), gate applied in SQL first |
| `taxonomy/tech_roles.json` | copy of the target-role taxonomy (3 identical copies, see below) |
| `workers/stream_consumer.py` | Redis stream handlers |
| `training/` | dataset generator, training, evaluation (see `training/README.md`) |
| `scripts/` | `backfill_embeddings.py`, `export_real_labels.py` |
| `scripts/` | `backfill_embeddings.py`, `export_real_labels.py`, `check_taxonomy.py` |

Run tests: `EMBEDDING_BACKEND=hash python -m unittest discover -s tests -t . -v` (hash = offline stand-in, tests logic only).
`GET /model` shows the live scorer/threshold/embedder. Tunables are env vars, see `app/core/config.py`.

Taxonomy copies: `apps/resume-service/src/taxonomy/tech-roles.json` (owner), `apps/jd-extractor-agent/app/taxonomy/tech_roles.json`
and `app/taxonomy/tech_roles.json` here must be identical. Check: `python -m scripts.check_taxonomy` (also runs inside the unit tests).