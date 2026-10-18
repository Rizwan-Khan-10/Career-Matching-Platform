"""Display label of a resume's target role, e.g. "Backend · Java" (same text resume-service builds, contract 4.9 / 4.10).
Resumes are read through read-only SQL here, so the label is rebuilt from the taxonomy ids."""

TRACK_LABELS = {
    "frontend": "Frontend",
    "backend": "Backend",
    "fullstack": "Full-stack",
    "mobile": "Mobile",
    "data_ml": "Data / ML / AI",
    "devops_cloud": "DevOps / Cloud",
    "qa": "QA / Testing",
    "other": "Other",
}

STACK_LABELS = {
    "java": "Java",
    "python": "Python",
    "javascript": "JavaScript / TypeScript (Node, React…)",
    "dotnet": ".NET / C#",
    "go": "Go",
    "php": "PHP",
    "ruby": "Ruby",
    "android": "Android",
    "ios": "iOS",
    "cross_platform": "Cross-platform (Flutter, React Native…)",
    "data_analyst": "Data Analyst",
    "data_engineer": "Data Engineer",
    "ml_ai": "ML / AI",
    "aws": "AWS",
    "azure": "Azure",
    "gcp": "Google Cloud",
    "general": "General",
    "manual": "Manual testing",
    "automation": "Automation testing",
    "other": "Other",
}


def target_label(track_id: str | None, stack_id: str | None) -> str | None:
    """None when the resume is unknown (deleted); the "other" track is just "Other"."""
    if not track_id:
        return None
    track = TRACK_LABELS.get(track_id, track_id)
    if track_id == "other":
        return track
    return f"{track} · {STACK_LABELS.get(stack_id or '', stack_id or 'Other')}"
