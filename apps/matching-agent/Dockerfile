# syntax=docker/dockerfile:1
# Build context = this folder:  docker build -t matching-agent apps/matching-agent
FROM python:3.11-slim

ARG EMBEDDING_MODEL_NAME=all-MiniLM-L6-v2
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    HF_HOME=/opt/hf \
    PORT=8000
ENV EMBEDDING_MODEL_NAME=${EMBEDDING_MODEL_NAME}

WORKDIR /app

# CPU-only torch wheels (the default PyPI wheel pulls ~2 GB of CUDA libraries)
COPY requirements.txt .
RUN pip install --extra-index-url https://download.pytorch.org/whl/cpu -r requirements.txt

# embedding model downloaded at BUILD time; the running container never needs the network for it
RUN python -c "import os; from sentence_transformers import SentenceTransformer; SentenceTransformer(os.environ['EMBEDDING_MODEL_NAME'])" \
 && chmod -R a+rX /opt/hf
ENV HF_HUB_OFFLINE=1

RUN useradd --system --create-home --uid 10001 app
COPY app ./app
COPY scripts ./scripts
# scorer + other artifacts are read-only for the app user (compose also mounts app/artifacts :ro)
RUN chmod -R a-w app/artifacts
USER app
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
  CMD python -c "import os, urllib.request; urllib.request.urlopen('http://127.0.0.1:%s/health' % os.environ.get('PORT', '8000'), timeout=4)"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]