# syntax=docker/dockerfile:1
# Build context = this folder:  docker build -t chatbot-agent apps/chatbot-agent
FROM python:3.11-slim

# PIP_DEFAULT_TIMEOUT / PIP_RETRIES: pip's defaults (15 s, 5 retries) give up on a slow connection
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_DEFAULT_TIMEOUT=120 \
    PIP_RETRIES=10 \
    PORT=8000

WORKDIR /app

COPY requirements.txt .
# BuildKit cache mount: wheels that were already downloaded survive a failed or repeated build (the cache is not part of the image)
RUN --mount=type=cache,target=/root/.cache/pip pip install -r requirements.txt

RUN useradd --system --create-home --uid 10001 app
COPY app ./app

USER app
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD python -c "import os, urllib.request; urllib.request.urlopen('http://127.0.0.1:%s/health' % os.environ.get('PORT', '8000'), timeout=4)"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
