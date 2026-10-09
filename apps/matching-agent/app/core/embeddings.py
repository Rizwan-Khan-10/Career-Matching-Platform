"""Single place where text -> vector happens (used by scoring AND by embedding upserts).

All vectors are L2-normalised, so cosine similarity == dot product.
"""
import hashlib
import threading
import numpy as np
from app.core.config import EMBEDDING_BACKEND, EMBEDDING_MODEL_NAME

DIM = 384
_lock = threading.RLock()  # re-entrant: embed_many() holds it while _backend() takes it
_model = None


class _HashBackend:
    """Offline fallback for tests ONLY: hashed word + char-trigram bag. Captures spelling overlap,
    NOT semantics. name is different from the real model so a scorer trained on one is never
    silently used with the other."""
    name = "hash-384"

    def encode(self, texts):
        out = np.zeros((len(texts), DIM), dtype=np.float32)
        for i, t in enumerate(texts):
            t = (t or "").lower()
            feats = t.split() + [t[j:j + 3] for j in range(max(len(t) - 2, 0))]
            for f in feats:
                h = int(hashlib.md5(f.encode()).hexdigest(), 16)
                out[i, h % DIM] += 1.0 if (h >> 20) % 2 else -1.0
        norms = np.linalg.norm(out, axis=1, keepdims=True)
        norms[norms == 0] = 1.0
        return out / norms


class _MiniLMBackend:
    def __init__(self):
        from sentence_transformers import SentenceTransformer
        self._m = SentenceTransformer(EMBEDDING_MODEL_NAME)
        self.name = EMBEDDING_MODEL_NAME

    def encode(self, texts):
        return np.asarray(self._m.encode(list(texts), normalize_embeddings=True, batch_size=64, show_progress_bar=False), dtype=np.float32)


def _backend():
    global _model
    if _model is None:
        with _lock:
            if _model is None:
                _model = _HashBackend() if EMBEDDING_BACKEND == "hash" else _MiniLMBackend()
    return _model


def model_name() -> str:
    return _backend().name


# tiny cache: skills repeat a LOT across resumes/roles
_cache: dict = {}
_CACHE_MAX = 20000


def embed_many(texts) -> np.ndarray:
    """Returns (n, 384) normalised float32 array. Uses a cache for repeated strings."""
    texts = [t if t else " " for t in texts]
    missing = [t for t in dict.fromkeys(texts) if t not in _cache]
    if missing:
        with _lock:
            vecs = _backend().encode(missing)
            if len(_cache) + len(missing) > _CACHE_MAX:
                _cache.clear()
            for t, v in zip(missing, vecs):
                _cache[t] = v
    return np.stack([_cache[t] for t in texts]) if texts else np.zeros((0, DIM), dtype=np.float32)


def embed_one(text: str) -> np.ndarray:
    return embed_many([text])[0]


def to_pgvector(vec) -> str:
    """pgvector text literal, use with %s::vector"""
    return "[" + ",".join(f"{float(x):.6f}" for x in vec) + "]"