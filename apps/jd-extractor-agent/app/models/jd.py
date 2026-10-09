from typing import Optional
from pydantic import BaseModel, field_validator
from app.services.jd_numbers import coerce_min_years


def _str(v) -> str:
    return "" if v is None else str(v).strip()


class JdUploadedEvent(BaseModel):
    """Shape of the incoming 'jd.uploaded' Redis stream event."""
    jobPostingId: str
    companyId: str
    fileUrl: str


class JobRoleData(BaseModel):
    title: str = ""
    summary: Optional[str] = None
    requiredSkills: list[str] = []
    preferredSkills: list[str] = []
    minExperienceYears: Optional[float] = None
    qualifications: Optional[str] = None
    responsibilities: list[str] = []
    seniority: Optional[str] = None
    location: Optional[str] = None
    employmentType: Optional[str] = None

    @field_validator("requiredSkills", "preferredSkills", "responsibilities", mode="before")
    @classmethod
    def v_list(cls, v):
        if v is None:
            return []
        if isinstance(v, str):
            return [x.strip() for x in v.split(",") if x.strip()]
        return v

    @field_validator("title", mode="before")
    @classmethod
    def v_title(cls, v):
        return _str(v)

    @field_validator("summary", "qualifications", "seniority", "location", "employmentType", mode="before")
    @classmethod
    def v_opt_str(cls, v):
        if isinstance(v, list):
            v = "; ".join(_str(x) for x in v)
        return _str(v) or None

    @field_validator("minExperienceYears", mode="before")
    @classmethod
    def v_min_exp(cls, v):
        return coerce_min_years(v)


class ParsedJdData(BaseModel):
    """Shape Groq's JSON output must match."""
    roles: list[JobRoleData] = []

    @field_validator("roles", mode="before")
    @classmethod
    def v_roles(cls, v):
        return [] if v is None else v


class JdExtractedEvent(BaseModel):
    """Shape of the outgoing 'jd.extracted' Redis stream event."""
    jobPostingId: str
    companyId: str
    roleIds: list[str]