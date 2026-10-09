from pydantic import BaseModel, ConfigDict
from typing import Optional, Any


class ResumeParsedEvent(BaseModel):
    """Incoming 'resume.parsed' / 'resume.updated' event. Extra parsed fields are kept (extra=allow)."""
    model_config = ConfigDict(extra="allow")
    resumeId: str
    applicantId: str
    skills: list[str] = []
    projects: list[dict] = []
    experience: list[dict] = []
    education: Optional[str] = None
    cgpa: Optional[float] = None
    experienceYears: Optional[float] = None

    def profile(self) -> dict:
        """The parsed-resume dict used for embedding + scoring (identity fields removed)."""
        d = self.model_dump()
        d.pop("resumeId", None)
        d.pop("applicantId", None)
        return d


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