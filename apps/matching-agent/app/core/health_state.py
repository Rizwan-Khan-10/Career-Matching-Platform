"""Tiny registry so GET /health can see the consumer threads (contract §3.5).

`startup` = the one-off work before the consumers run (ensure_tables ...). Every `consume_loop` registers itself and
marks itself stopped if it ever exits, so a dead thread turns /health into 503 instead of a fake "ok".
"""
import threading

_lock = threading.Lock()
_startup: dict = {"status": "starting", "error": None}     # starting | running | failed | disabled
_loops: dict = {}                                           # stream -> {"status", "error", "thread"}


def set_startup(status: str, error=None) -> None:
    with _lock:
        _startup.update(status=status, error=(str(error)[:300] if error else None))


def register_loop(name: str) -> None:
    with _lock:
        _loops[name] = {"status": "running", "error": None, "thread": threading.current_thread()}


def loop_stopped(name: str, error: str = "consumer loop exited") -> None:
    with _lock:
        if name in _loops:
            _loops[name].update(status="failed", error=error)


def snapshot() -> dict:
    with _lock:
        return {"startup": _startup["status"], "loops": {n: s["status"] for n, s in _loops.items()}}


def failures() -> dict:
    """name -> reason, for everything that is broken right now (empty = healthy)."""
    out = {}
    with _lock:
        if _startup["status"] == "failed":
            out["startup"] = _startup["error"] or "startup failed"
        for name, s in _loops.items():
            if s["status"] == "failed":
                out[name] = s["error"] or "consumer failed"
            elif not s["thread"].is_alive():
                out[name] = "consumer thread died"
    return out


def reset() -> None:
    """Tests only."""
    with _lock:
        _startup.update(status="starting", error=None)
        _loops.clear()