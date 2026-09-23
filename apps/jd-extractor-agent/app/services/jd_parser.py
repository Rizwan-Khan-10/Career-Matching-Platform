import json
from app.core.llm_client import ask_llm
from app.models.jd import ParsedJdData

SYSTEM_PROMPT = """You extract job role requirements from a company document, which may describe
ONE OR MORE roles. Always respond with valid JSON only, matching this exact shape:
{
  "roles": [
    {
      "title": "string",
      "requiredSkills": ["string"],
      "minExperienceYears": number or null,
      "qualifications": "string"
    }
  ]
}
If the document describes only one role, return an array with a single item."""


def parse_jd(text: str) -> ParsedJdData:
    raw = ask_llm(SYSTEM_PROMPT, text[:8000])
    data = json.loads(raw)
    return ParsedJdData(**data)  # validates shape; raises clear error if Groq's output is malformed