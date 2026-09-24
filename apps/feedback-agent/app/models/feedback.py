from pydantic import BaseModel
from typing import Optional


class MatchComputedEvent(BaseModel):
    """Shape of the incoming 'match.computed' event."""
    applicantId: str
    jobRoleId: str
    score: float
    eligible: bool


class FeedbackResult(BaseModel):
    """Shape Groq's JSON output must match."""
    feedback: str


class FeedbackReadyEvent(BaseModel):
    """Shape of the outgoing 'feedback.ready' event."""
    applicantId: str
    jobRoleId: str
    feedback: str