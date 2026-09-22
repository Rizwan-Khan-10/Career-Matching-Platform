from pydantic import BaseModel
from typing import Optional


class ResumeUploadedEvent(BaseModel):
    """Shape of the incoming 'resume.uploaded' Redis stream event."""
    resumeId: str
    applicantId: str
    fileUrl: str


class ResumeProject(BaseModel):
    name: str
    description: str


class ParsedResumeData(BaseModel):
    """Shape Groq's JSON output must match — used to validate the LLM's response."""
    skills: list[str] = []
    projects: list[ResumeProject] = []
    education: Optional[str] = None
    cgpa: Optional[float] = None
    experienceYears: Optional[float] = None


class ResumeParsedEvent(BaseModel):
    """Shape of the outgoing 'resume.parsed' Redis stream event."""
    resumeId: str
    applicantId: str
    skills: list[str] = []
    projects: list[ResumeProject] = []
    education: Optional[str] = None
    cgpa: Optional[float] = None
    experienceYears: Optional[float] = None