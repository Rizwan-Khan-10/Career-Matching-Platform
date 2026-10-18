from pydantic import BaseModel
from typing import Optional


class MatchComputedEvent(BaseModel):
    """Shape of the incoming 'match.computed' event (contract section 6)."""
    applicantId: str
    jobRoleId: str
    score: float
    eligible: bool
    reason: str = ""
    matchedSkills: list[str] = []
    partialSkills: list[str] = []
    missingSkills: list[str] = []
    resumeId: Optional[str] = None            # the resume this result was computed on
    unverifiedRules: list[str] = []           # rule fields whose applicant value is unknown (cgpa, branch, passingYear, backlogs)


class FeedbackResult(BaseModel):
    """Shape Groq's JSON output must match."""
    feedback: str


class FeedbackReadyEvent(BaseModel):
    """Shape of the outgoing 'feedback.ready' event."""
    applicantId: str
    jobRoleId: str
    feedback: str


class ShortlistInfo(BaseModel):
    """The company's own shortlist form. Only roundName and mode are ever shown to the LLM."""
    roundName: str
    mode: str
    scheduledAt: Optional[str] = None
    bring: Optional[str] = None
    link: Optional[str] = None
    address: Optional[str] = None
    note: Optional[str] = None


class CandidateShortlistedEvent(BaseModel):
    """Shape of the incoming 'candidate.shortlisted' event (contract section 6)."""
    matchId: str
    applicantId: str
    jobRoleId: str
    companyId: Optional[str] = None
    roleTitle: Optional[str] = None
    companyName: Optional[str] = None
    shortlist: ShortlistInfo


class PrepGuideResult(BaseModel):
    """Shape the LLM's JSON output must match for a prep guide."""
    guide: str


class PrepReadyEvent(BaseModel):
    """Shape of the outgoing 'prep.ready' event."""
    matchId: str
    applicantId: str
    jobRoleId: str
    guide: str


class CandidateRejectedEvent(BaseModel):
    """Shape of the incoming 'candidate.rejected' event (contract section 6). `message` (the company's note to the
    candidate) is shown to the candidate by results-service / notification-service and is never given to the LLM."""
    matchId: str
    applicantId: str
    jobRoleId: str
    companyId: Optional[str] = None
    roleTitle: Optional[str] = None
    reasonCategory: str
    message: Optional[str] = None


class RejectionFeedbackReadyEvent(BaseModel):
    """Shape of the outgoing 'rejection-feedback.ready' event: `feedback` is None for position_filled / other."""
    matchId: str
    applicantId: str
    jobRoleId: str
    feedback: Optional[str] = None
