import re
from typing import Optional
from pydantic import BaseModel, field_validator


def _num(v):
    if v is None or isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    m = re.search(r"-?\d+(?:\.\d+)?", str(v))
    return float(m.group()) if m else None


def _str(v) -> str:
    return "" if v is None else str(v).strip()


class ResumeUploadedEvent(BaseModel):
    """Shape of the incoming 'resume.uploaded' Redis stream event."""
    resumeId: str
    applicantId: str
    fileUrl: str


class ResumeProject(BaseModel):
    name: str = ""
    description: str = ""

    @field_validator("name", "description", mode="before")
    @classmethod
    def v_str(cls, v):
        return _str(v)


class ResumeExperience(BaseModel):
    title: str = ""
    company: str = ""
    startDate: Optional[str] = None
    endDate: Optional[str] = None
    description: str = ""

    @field_validator("title", "company", "description", mode="before")
    @classmethod
    def v_str(cls, v):
        return _str(v)

    @field_validator("startDate", "endDate", mode="before")
    @classmethod
    def v_date(cls, v):
        return None if v is None or str(v).strip() == "" else str(v).strip()


class ParsedResumeData(BaseModel):
    """Shape Groq's JSON output must match — tolerant: a sloppy-but-usable LLM answer (nulls, '8.5/10',
    missing keys) is cleaned instead of failing the whole resume. Old keys are unchanged (UI stays compatible)."""
    skills: list[str] = []
    projects: list[ResumeProject] = []
    experience: list[ResumeExperience] = []
    education: Optional[str] = None
    currentTitle: Optional[str] = None
    summary: Optional[str] = None
    certifications: list[str] = []
    cgpa: Optional[float] = None
    experienceYears: Optional[float] = None

    @field_validator("skills", "projects", "experience", "certifications", mode="before")
    @classmethod
    def v_list(cls, v):
        return [] if v is None else v

    @field_validator("education", "currentTitle", "summary", mode="before")
    @classmethod
    def v_opt_str(cls, v):
        if isinstance(v, list):
            v = "; ".join(_str(x) for x in v)
        s = _str(v)
        return s or None

    @field_validator("cgpa", mode="before")
    @classmethod
    def v_cgpa(cls, v):
        """Normalise to a 10-point scale: '8.5/10' -> 8.5, '3.8/4' -> 9.5, '85%' -> 8.5."""
        if v is None:
            return None
        s = str(v)
        m = re.search(r"(\d+(?:\.\d+)?)\s*/\s*(\d+(?:\.\d+)?)", s)
        if m and float(m.group(2)) > 0:
            return round(float(m.group(1)) / float(m.group(2)) * 10, 2)
        n = _num(v)
        if n is None or n < 0:
            return None
        if n > 10:
            n = n / 10 if n <= 100 else None
        return n

    @field_validator("experienceYears", mode="before")
    @classmethod
    def v_years(cls, v):
        n = _num(v)
        return None if n is None or n < 0 or n > 50 else round(n, 1)


class ResumeParsedEvent(BaseModel):
    """Shape of the outgoing 'resume.parsed' Redis stream event."""
    resumeId: str
    applicantId: str
    skills: list[str] = []
    projects: list[ResumeProject] = []
    experience: list[ResumeExperience] = []
    education: Optional[str] = None
    currentTitle: Optional[str] = None
    summary: Optional[str] = None
    certifications: list[str] = []
    cgpa: Optional[float] = None
    experienceYears: Optional[float] = None