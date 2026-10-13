import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, List
from app.services.rag_service import get_context_for_applicant, get_context_for_company
from app.services.chat_responder import respond

log = logging.getLogger("chatbot.api")
router = APIRouter()


class HistoryTurn(BaseModel):
    sender: str
    content: str = Field(max_length=8000)


class ChatRequest(BaseModel):
    userId: str
    role: str
    message: str = Field(min_length=1, max_length=4000)
    jobRoleId: Optional[str] = None
    history: Optional[List[HistoryTurn]] = Field(default=None, max_length=60)


@router.post("/chat")
def chat(req: ChatRequest):
    # userId / role / jobRoleId come from chat-service (verified JWT + conversation owner), never from message text.
    # This service must stay internal: only chat-service may reach it (nginx does not route to it).
    try:
        if req.role == "APPLICANT":
            context = get_context_for_applicant(req.userId, req.jobRoleId)
        else:
            context = get_context_for_company(req.userId)
        history = [h.model_dump() for h in req.history] if req.history else None
        return {"reply": respond(req.role, req.message, context, history)}
    except Exception as exc:
        log.exception("chat failed")
        raise HTTPException(status_code=502, detail="assistant unavailable") from exc