# matching-agent

Decides which resumes are eligible for which job roles. **No LLM in the decision** (deterministic, explainable,
immune to prompt injection inside resumes).

```
resume.parsed / resume.updated ─┐                       ┌─> match.computed ─> matching-results-service ─> UI / e-mail
                                ├─> retrieve (pgvector) ─> features (embeddings) ─> scorer + gates
jd.extracted (new/edited role) ─┘
job.role.deleted -> drop the role's vector
```

| file | job |
|---|---|
| `services/profile_text.py` | structured text that is embedded (same builder on resume + role side) |
| `services/features.py` | per-skill semantic similarity -> 14 features |
| `services/scorer.py` | logistic model (`artifacts/scorer.json`) + hard gates |
| `services/matcher.py` | one resume x one role -> score, eligible, reason, matched/missing skills |
| `services/vector_search.py` | shortlist candidates with pgvector (cosine) |
| `workers/stream_consumer.py` | Redis stream handlers |
| `training/` | dataset generator, training, evaluation (see `training/README.md`) |
| `scripts/` | `backfill_embeddings.py`, `export_real_labels.py` |

Run tests: `EMBEDDING_BACKEND=hash python -m unittest discover -s tests -t . -v` (hash = offline stand-in, tests logic only).
`GET /model` shows the live scorer/threshold/embedder. Tunables are env vars, see `app/core/config.py`.