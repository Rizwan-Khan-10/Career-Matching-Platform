from pydantic import BaseModel
from typing import Optional, Any


class ResumeParsedEvent(BaseModel):
    """Incoming event — triggers resume -> matching roles direction."""
    resumeId: str
    applicantId: str
    skills: list[str] = []
    projects: list[dict] = []
    education: Optional[str] = None
    cgpa: Optional[float] = None
    experienceYears: Optional[float] = None


class JdExtractedEvent(BaseModel):
    """Incoming event — triggers role -> matching resumes direction."""
    jobPostingId: str
    companyId: str
    roleIds: list[str]


class MatchEvaluation(BaseModel):
    """Shape Groq's JSON output must match when scoring a single candidate x role pair."""
    eligible: bool
    score: float
    reason: str


class MatchComputedEvent(BaseModel):
    """Shape of the outgoing 'match.computed' event."""
    applicantId: str
    jobRoleId: str
    score: float
    eligible: bool