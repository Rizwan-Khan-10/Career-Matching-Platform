from groq import Groq
from app.core.config import GROQ_API_KEY

client = Groq(api_key=GROQ_API_KEY)

def ask_llm(system_prompt: str, user_prompt: str, json_mode: bool = True) -> str:
    response = client.chat.completions.create(
        model="openai/gpt-oss-120b",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        response_format={"type": "json_object"} if json_mode else None,
        temperature=0.2,
    )
    return response.choices[0].message.content
