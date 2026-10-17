from pydantic import BaseModel, ConfigDict
from typing import Optional, Any


class ResumeEvent(BaseModel):
    """Incoming 'resume.confirmed' / 'resume.updated' event. Only the ids matter: the parsed data is always
    re-read from the DB (and the resume must still be active), so a stale event can never score stale data."""
    model_config = ConfigDict(extra="allow")
    resumeId: str
    applicantId: Optional[str] = None
    targetTrack: Optional[str] = None
    targetStack: Optional[str] = None


class ResumeDeletedEvent(BaseModel):
    """Incoming 'resume.deleted' event."""
    model_config = ConfigDict(extra="allow")
    resumeId: str
    applicantId: str


class ProfileUpdatedEvent(BaseModel):
    """Incoming 'profile.updated' event (academic fields of the applicant changed)."""
    model_config = ConfigDict(extra="allow")
    applicantId: str


class JdExtractedEvent(BaseModel):
    """Incoming 'jd.extracted' event — triggers role -> matching resumes direction."""
    jobPostingId: str
    companyId: str
    roleIds: list[str]


class MatchComputedEvent(BaseModel):
    """Shape of the outgoing 'match.computed' event (superset of the old one -> consumers stay compatible)."""
    applicantId: str
    jobRoleId: str
    roleTitle: Optional[str] = None
    resumeId: Optional[str] = None
    score: float
    eligible: bool
    reason: str = ""
    matchedSkills: list[str] = []
    partialSkills: list[str] = []
    missingSkills: list[str] = []
    breakdown: dict[str, Any] = {}
    modelVersion: Optional[str] = None