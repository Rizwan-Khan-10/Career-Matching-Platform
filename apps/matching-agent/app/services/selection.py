from app.core import config


def select_for_publish(scored: list, max_ineligible: int) -> list:
    """All eligible pairs + only the best few near-misses (ineligible but not hopeless).
    Publishing every low-scoring pair would flood applicants' pages and trigger an LLM feedback call each."""
    eligible = [s for s in scored if s["result"].eligible]
    near = [s for s in scored if not s["result"].eligible and s["result"].score >= config.MIN_PUBLISH_SCORE]
    near.sort(key=lambda s: s["result"].score, reverse=True)
    eligible.sort(key=lambda s: s["result"].score, reverse=True)
    return eligible + near[:max_ineligible]