import os

# lets the app modules import on a bare machine / in CI: nothing here talks to Groq or Postgres
os.environ.setdefault("GROQ_API_KEY", "placeholder")
os.environ.setdefault("DATABASE_URL", "postgresql://placeholder:placeholder@localhost:5432/placeholder")
