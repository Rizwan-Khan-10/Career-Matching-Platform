import json
from app.core.llm_client import ask_llm
from app.models.feedback import FeedbackResult

SYSTEM_PROMPT = """You write a specific, actionable improvement guide for a job applicant who was
not selected for a role. Compare their resume data against the role's requirements, and against
the profiles of applicants who WERE selected for the same role, to calibrate realistic advice.
Be specific — name actual missing skills, project gaps, or experience gaps. Avoid generic advice
like "improve your skills". Respond with valid JSON only: {"feedback": "string"}"""

def generate_feedback(applicant_data: dict, requirements: dict, selected_profiles: list) -> str:
    prompt = json.dumps({
        "applicant": applicant_data,
        "requirements": requirements,
        "selectedCandidates": selected_profiles,
    })
    raw = ask_llm(SYSTEM_PROMPT, prompt)
    data = json.loads(raw)
    result = FeedbackResult(**data)  # validates shape; raises clear error if Groq's output is malformed
    return result.feedback