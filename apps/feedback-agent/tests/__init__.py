import os

# lets the app modules import on a bare machine / in CI: nothing here talks to Groq, Postgres or Redis
os.environ.setdefault("GROQ_API_KEY", "placeholder")
os.environ.setdefault("DATABASE_URL", "postgresql://placeholder:placeholder@localhost:5432/placeholder")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379")
