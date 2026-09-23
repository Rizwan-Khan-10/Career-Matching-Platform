from pydantic import BaseModel
from typing import Optional


class JdUploadedEvent(BaseModel):
    """Shape of the incoming 'jd.uploaded' Redis stream event."""
    jobPostingId: str
    companyId: str
    fileUrl: str


class JobRoleData(BaseModel):
    title: str
    requiredSkills: list[str] = []
    minExperienceYears: Optional[float] = None
    qualifications: Optional[str] = None


class ParsedJdData(BaseModel):
    """Shape Groq's JSON output must match."""
    roles: list[JobRoleData] = []


class JdExtractedEvent(BaseModel):
    """Shape of the outgoing 'jd.extracted' Redis stream event."""
    jobPostingId: str
    companyId: str
    roleIds: list[str]