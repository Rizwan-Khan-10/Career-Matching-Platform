from sentence_transformers import SentenceTransformer

model = SentenceTransformer("all-MiniLM-L6-v2")


def embed(text: str) -> list[float]:
    """L2-normalised vector. Must be the same model as matching-agent (app/core/embeddings.py)."""
    return model.encode(text, normalize_embeddings=True).tolist()


def to_pgvector(vec) -> str:
    return "[" + ",".join(f"{float(x):.6f}" for x in vec) + "]"