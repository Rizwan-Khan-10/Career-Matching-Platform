import json
from app.core.llm_client import ask_llm

SYSTEM_PROMPT = """You extract structured data from resumes. Always respond with valid JSON only,
matching this exact shape:
{
  "skills": ["string"],
  "projects": [{"name": "string", "description": "string"}],
  "education": "string",
  "cgpa": number or null,
  "experienceYears": number or null
}
If a field can't be found, use null or an empty array — never omit a key."""

def parse_resume(text: str) -> dict:
    raw = ask_llm(SYSTEM_PROMPT, text[:8000])  # truncate very long resumes
    return json.loads(raw)