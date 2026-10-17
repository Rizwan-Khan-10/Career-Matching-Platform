"""Bounded in-process LRU caches for the two prepared halves of a match (contract §8.5).

  resume side  key = (resumeId, content hash of parsedData)          -> features.ResumeSide
  role side    key = (roleId,  content hash of title + requirements) -> features.RoleSide

The content hash is part of the key, so an edited resume / role can never be served from a stale entry.
Thread-safe (six consumer threads share the process). Size: SIDE_CACHE_SIZE entries per side.
"""
import threading
from collections import OrderedDict

from app.core import config
from app.services.features import build_resume_side, build_role_side
from app.services.input_hash import content_hash


class LRUCache:
    def __init__(self, maxsize: int):
        self.maxsize = max(1, int(maxsize))
        self._data: OrderedDict = OrderedDict()
        self._lock = threading.Lock()
        self.hits = 0
        self.misses = 0

    def get_or_build(self, key, build):
        with self._lock:
            if key in self._data:
                self._data.move_to_end(key)
                self.hits += 1
                return self._data[key]
            self.misses += 1
        value = build()          # built outside the lock: embedding can be slow
        with self._lock:
            self._data[key] = value
            self._data.move_to_end(key)
            while len(self._data) > self.maxsize:
                self._data.popitem(last=False)
        return value

    def clear(self):
        with self._lock:
            self._data.clear()
            self.hits = self.misses = 0

    def stats(self) -> dict:
        with self._lock:
            return {"size": len(self._data), "maxSize": self.maxsize, "hits": self.hits, "misses": self.misses}


_resume_cache = LRUCache(config.SIDE_CACHE_SIZE)
_role_cache = LRUCache(config.SIDE_CACHE_SIZE)


def get_resume_side(resume_id: str, parsed_data: dict):
    return _resume_cache.get_or_build((resume_id, content_hash(parsed_data or {})), lambda: build_resume_side(parsed_data or {}))


def get_role_side(role_id: str, title: str, requirements: dict):
    key = (role_id, content_hash({"title": title or "", "requirements": requirements or {}}))
    return _role_cache.get_or_build(key, lambda: build_role_side(title or "", requirements or {}))


def cache_stats() -> dict:
    return {"resumeSide": _resume_cache.stats(), "roleSide": _role_cache.stats()}


def clear_caches():
    _resume_cache.clear()
    _role_cache.clear()