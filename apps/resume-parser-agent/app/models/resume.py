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


_YEAR_RE = re.compile(r"\b(?:19|20)\d{2}\b")
# the LLM sometimes writes these instead of null; they must never be stored as a real value
_EMPTY_WORDS = {"null", "none", "n/a", "na", "nil", "not stated", "not mentioned", "unknown", "-"}


class ResumeUploadedEvent(BaseModel):
    """Shape of the incoming 'resume.uploaded' Redis stream event."""
    resumeId: str
    applicantId: str
    fileUrl: str
    requestId: Optional[str] = None


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
    """Shape Groq's JSON output must match (contract §4.2) — tolerant: a sloppy-but-usable LLM answer (nulls, '8.5/10',
    missing keys) is cleaned instead of failing the whole resume. branch / passingYear / backlogs are null when the
    resume does not state them (never invented)."""
    skills: list[str] = []
    projects: list[ResumeProject] = []
    experience: list[ResumeExperience] = []
    education: Optional[str] = None
    currentTitle: Optional[str] = None
    summary: Optional[str] = None
    certifications: list[str] = []
    cgpa: Optional[float] = None
    branch: Optional[str] = None
    passingYear: Optional[int] = None
    backlogs: Optional[int] = None
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
        """Normalise to the 10-point scale (contract §4.3): '8.5/10' -> 8.5, '3.8/4' -> 9.5, '85%' or 85 -> 8.5.
        Anything unusable (0, > 100, nonsense ratio) -> None."""
        if v is None or isinstance(v, bool):
            return None
        m = re.search(r"(\d+(?:\.\d+)?)\s*/\s*(\d+(?:\.\d+)?)", str(v))
        if m and float(m.group(2)) > 0:
            n = float(m.group(1)) / float(m.group(2)) * 10
        else:
            n = _num(v)
            if n is not None and n > 10:
                n = n / 10 if n <= 100 else None   # a value above 10 is a percentage
        return round(n, 2) if n is not None and 0 < n <= 10 else None

    @field_validator("branch", mode="before")
    @classmethod
    def v_branch(cls, v):
        s = _str(v)
        return None if not s or s.lower() in _EMPTY_WORDS else s[:80]

    @field_validator("passingYear", mode="before")
    @classmethod
    def v_passing_year(cls, v):
        """'2026' / 'May 2026' / '2022-2026' -> 2026 (the LAST year written). Outside 1990-2050 or no year -> None."""
        if v is None or isinstance(v, bool):
            return None
        years = _YEAR_RE.findall(str(v))
        if not years:
            return None
        y = int(years[-1])
        return y if 1990 <= y <= 2050 else None

    @field_validator("backlogs", mode="before")
    @classmethod
    def v_backlogs(cls, v):
        """Whole number 0-50, else None. Missing is NOT 0: only an explicit number counts."""
        n = _num(v)
        if n is None or n < 0 or n > 50 or n != int(n):
            return None
        return int(n)

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
    branch: Optional[str] = None
    passingYear: Optional[int] = None
    backlogs: Optional[int] = None
    experienceYears: Optional[float] = None