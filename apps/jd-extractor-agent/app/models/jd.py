from typing import Optional
from pydantic import BaseModel, field_validator, model_validator
from app.services.jd_numbers import (
    clean_branches, coerce_backlogs, coerce_cgpa, coerce_level, coerce_max_years, coerce_min_years, coerce_passing_years,
)
from app.services.taxonomy import clean_track


def _str(v) -> str:
    return "" if v is None else str(v).strip()


class JdUploadedEvent(BaseModel):
    """Shape of the incoming 'jd.uploaded' Redis stream event."""
    jobPostingId: str
    companyId: str
    fileUrl: str
    requestId: Optional[str] = None


class JobRoleData(BaseModel):
    """One role = JobRole.requirements (contract §4.1). New keys: absent / null = rule not set.
    track / stacks come from the taxonomy (unsure -> 'other' / []); the academic rules are null unless the JD states them."""
    title: str = ""
    summary: Optional[str] = None
    requiredSkills: list[str] = []
    preferredSkills: list[str] = []
    minExperienceYears: Optional[float] = None
    maxExperienceYears: Optional[float] = None  # only when the JD states a range / upper limit; the company confirms it
    qualifications: Optional[str] = None
    responsibilities: list[str] = []
    seniority: Optional[str] = None
    location: Optional[str] = None
    employmentType: Optional[str] = None
    level: str = "any"
    track: str = "other"
    stacks: list[str] = []
    minCgpa: Optional[float] = None
    allowedBranches: Optional[list[str]] = None
    passingYears: Optional[list[int]] = None
    maxBacklogs: Optional[int] = None

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

    @field_validator("maxExperienceYears", mode="before")
    @classmethod
    def v_max_exp(cls, v):
        return coerce_max_years(v)

    @model_validator(mode="after")
    def v_exp_band(self):
        # an upper bound below the lower bound is a misread: drop it (no upper limit) rather than create an empty band
        if self.minExperienceYears is not None and self.maxExperienceYears is not None and self.maxExperienceYears < self.minExperienceYears:
            self.maxExperienceYears = None
        return self

    @field_validator("level", mode="before")
    @classmethod
    def v_level(cls, v):
        return coerce_level(v)

    @field_validator("track", mode="before")
    @classmethod
    def v_track(cls, v):
        return clean_track(v)

    @field_validator("stacks", mode="before")
    @classmethod
    def v_stacks(cls, v):
        # generic clean-up only; filtering by the chosen track happens in jd_parser (needs the track)
        if v is None:
            return []
        if isinstance(v, str):
            v = v.split(",")
        return [str(x).strip().lower() for x in v if str(x).strip()] if isinstance(v, (list, tuple)) else []

    @field_validator("minCgpa", mode="before")
    @classmethod
    def v_min_cgpa(cls, v):
        return coerce_cgpa(v)

    @field_validator("allowedBranches", mode="before")
    @classmethod
    def v_branches(cls, v):
        return clean_branches(v)

    @field_validator("passingYears", mode="before")
    @classmethod
    def v_years(cls, v):
        return coerce_passing_years(v)

    @field_validator("maxBacklogs", mode="before")
    @classmethod
    def v_backlogs(cls, v):
        return coerce_backlogs(v)


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
    requestId: Optional[str] = None