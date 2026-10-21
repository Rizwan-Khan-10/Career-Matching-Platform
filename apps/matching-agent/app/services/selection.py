from app.core import config


def verdict_of(result) -> str:
    """eligible | review | not_eligible (older result objects without `verdict` are read from `eligible`)."""
    return getattr(result, "verdict", None) or ("eligible" if result.eligible else "not_eligible")


def select_for_publish(scored: list, max_ineligible: int, max_review: int | None = None) -> list:
    """All eligible pairs + the best `max_review` "possible matches" (review) + only the best few near-misses
    (not eligible but not hopeless). Publishing every low-scoring pair would flood applicants' pages and trigger an
    LLM feedback call each. max_review None = no cap on review pairs."""
    eligible = [s for s in scored if verdict_of(s["result"]) == "eligible"]
    review = [s for s in scored if verdict_of(s["result"]) == "review"]
    near = [s for s in scored if verdict_of(s["result"]) == "not_eligible" and s["result"].score >= config.MIN_PUBLISH_SCORE]
    for group in (eligible, review, near):
        group.sort(key=lambda s: s["result"].score, reverse=True)
    if max_review is not None:
        review = review[:max_review]
    return eligible + review + near[:max_ineligible]
