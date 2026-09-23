import json
from app.core.llm_client import ask_llm
from app.models.matching import MatchEvaluation

SYSTEM_PROMPT = """Compare a candidate's resume data against a job role's requirements.
Respond with valid JSON only: {"eligible": boolean, "score": number between 0 and 1, "reason": "string"}"""


def evaluate_match(parsed_resume: dict, requirements: dict) -> MatchEvaluation:
    prompt = f"Resume: {json.dumps(parsed_resume)}\n\nRole requirements: {json.dumps(requirements)}"
    raw = ask_llm(SYSTEM_PROMPT, prompt)
    data = json.loads(raw)
    return MatchEvaluation(**data)  # validates shape; raises clear error if Groq's output is malformed