"""Per-run efficiency counters (contract §8.7): logged for every run and served by GET /stats."""
import logging
import threading
import time
from collections import Counter, deque
from datetime import datetime, timezone

log = logging.getLogger("matching.stats")

COUNTERS = ("retrieved", "gatedOut", "prefiltered", "skippedByHash", "scored", "eligible")
_lock = threading.Lock()
_recent: deque = deque(maxlen=100)
_totals: Counter = Counter()
_started = datetime.now(timezone.utc).isoformat()


class Run:
    """Collects the counters of one trigger (resume.confirmed, jd.extracted, ...)."""

    def __init__(self, trigger: str, subject: str):
        self.trigger, self.subject = trigger, subject
        self.counts = {k: 0 for k in COUNTERS}
        self.stoppedBy = None
        self._t0 = time.perf_counter()

    def add(self, name: str, n: int = 1):
        self.counts[name] += n

    def finish(self) -> dict:
        rec = {"trigger": self.trigger, "subject": self.subject, **self.counts, "stoppedBy": self.stoppedBy,
               "ms": int((time.perf_counter() - self._t0) * 1000), "at": datetime.now(timezone.utc).isoformat()}
        with _lock:
            _recent.append(rec)
            _totals.update({k: self.counts[k] for k in COUNTERS})
            _totals["runs"] += 1
            _totals["ms"] += rec["ms"]
        log.info("run trigger=%s subject=%s retrieved=%d gatedOut=%d prefiltered=%d skippedByHash=%d scored=%d eligible=%d stoppedBy=%s ms=%d",
                 rec["trigger"], rec["subject"], rec["retrieved"], rec["gatedOut"], rec["prefiltered"],
                 rec["skippedByHash"], rec["scored"], rec["eligible"], rec["stoppedBy"], rec["ms"])
        return rec


def snapshot(recent: int = 20) -> dict:
    with _lock:
        return {"since": _started, "totals": dict(_totals), "recent": list(_recent)[-recent:][::-1]}


def reset():
    with _lock:
        _recent.clear()
        _totals.clear()