from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional, List
from app.services.rag_service import get_context_for_applicant, get_context_for_company
from app.services.chat_responder import respond

router = APIRouter()

class HistoryTurn(BaseModel):
    sender: str
    content: str

class ChatRequest(BaseModel):
    userId: str
    role: str
    message: str
    jobRoleId: Optional[str] = None
    history: Optional[List[HistoryTurn]] = None

@router.post("/chat")
def chat(req: ChatRequest):
    if req.role == "APPLICANT":
        context = get_context_for_applicant(req.userId, req.jobRoleId)
    else:
        context = get_context_for_company(req.userId)

    history = [h.dict() for h in req.history] if req.history else None
    reply = respond(req.role, req.message, context, history)
    return {"reply": reply}
