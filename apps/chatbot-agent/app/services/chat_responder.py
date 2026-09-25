import json
from app.core.llm_client import client

SYSTEM_PROMPT_APPLICANT = """You are a career assistant helping a job applicant discuss a specific
role they were evaluated for. Use ONLY the context provided (their resume, and this role's match
score, eligibility, and feedback). Be encouraging but honest. Respond conversationally, not as JSON."""

SYSTEM_PROMPT_COMPANY = """You are an assistant helping a company understand their posted roles
and applicant matches. Use ONLY the context provided. Respond conversationally, not as JSON."""

def respond(role: str, message: str, context: dict, history: list[dict] | None = None) -> str:
    system = SYSTEM_PROMPT_APPLICANT if role == "APPLICANT" else SYSTEM_PROMPT_COMPANY
    messages = [{"role": "system", "content": f"{system}\n\nContext: {json.dumps(context)}"}]

    for turn in (history or []):
        messages.append({
            "role": "user" if turn["sender"] == "user" else "assistant",
            "content": turn["content"],
        })

    response = client.chat.completions.create(
        model="openai/gpt-oss-120b",
        messages=messages,
        temperature=0.4,
    )
    return response.choices[0].message.content
