"""Best-first retrieval loop + small pure helpers (contract §8: best first, stop early, prefilter, best resume per pair).

No DB / embedding code here: the loop gets two callbacks, so it is unit-testable and the worker stays short.
"""
import numpy as np

from app.core import config


def scan_best_first(fetch_page, process_batch, *, top_k: int, batch_size: int | None = None,
                    max_eligible: int | None = None, empty_batches_stop: int | None = None) -> dict:
    """Pull candidates in similarity order, `batch_size` at a time, and hand each batch to `process_batch`.

    fetch_page(offset, limit) -> list of candidates (best similarity first; fewer than `limit` = no more candidates)
    process_batch(rows)       -> number of ELIGIBLE pairs in that batch (pairs skipped by hash count by their stored result)

    Stops at the first of: `top_k` candidates retrieved | `empty_batches_stop` consecutive batches without an eligible
    pair | `max_eligible` eligible pairs | candidates exhausted.
    Returns {"retrieved", "batches", "eligible", "stoppedBy"}.
    """
    batch_size = batch_size or config.BATCH_SIZE
    max_eligible = max_eligible or config.MAX_ELIGIBLE_PER_ROLE
    empty_batches_stop = empty_batches_stop or config.EARLY_STOP_EMPTY_BATCHES
    retrieved = batches = eligible = empty_streak = 0
    stopped_by = "exhausted"
    while retrieved < top_k:
        limit = min(batch_size, top_k - retrieved)
        rows = fetch_page(retrieved, limit)
        if not rows:
            break
        batches += 1
        retrieved += len(rows)
        found = int(process_batch(rows) or 0)
        eligible += found
        empty_streak = 0 if found else empty_streak + 1
        if eligible >= max_eligible:
            stopped_by = "max_eligible"
            break
        if empty_streak >= empty_batches_stop:
            stopped_by = "empty_batches"
            break
        if len(rows) < limit:
            break
    else:
        stopped_by = "top_k"
    return {"retrieved": retrieved, "batches": batches, "eligible": eligible, "stoppedBy": stopped_by}


def best_per_applicant(scored: list) -> list:
    """One entry per applicant: the best-scoring resume (eligible beats review beats not eligible, then score, then resumeId for stability).
    Used for what is PUBLISHED as match.computed; every evaluated pair is still reported in match.scanned."""
    best: dict = {}
    for s in scored:
        key = s["cand"]["applicantId"]
        tier = {"eligible": 2, "review": 1}.get(getattr(s["result"], "verdict", None) or ("eligible" if s["result"].eligible else "not_eligible"), 0)
        rank = (tier, float(s["result"].score), s["cand"]["resumeId"])
        if key not in best or rank > best[key][0]:
            best[key] = (rank, s)
    return [v[1] for v in sorted(best.values(), key=lambda v: v[0], reverse=True)]


def prefilter_skips(resume_side, role_side, min_cosine: float | None = None) -> bool:
    """True = skip this pair without scoring. Only when BOTH hold: the role lists required skills and none of them is
    literally present in the resume (alias-normalised), AND cosine(resume profile, role profile) < min_cosine.
    min_cosine None (default) = prefilter is off."""
    if min_cosine is None:
        min_cosine = config.PREFILTER_MIN_COSINE
    if min_cosine is None or not role_side.required:
        return False
    if set(role_side.required) & set(resume_side.skills):
        return False
    return float(np.dot(resume_side.profile_vec, role_side.role_vec)) < min_cosine