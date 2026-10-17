"""Tech-only filter for the training set (this platform matches TECH jobs only, Team Plan scope).

A parsed resume / JD is kept when it is clearly technical, judged on its TITLE and its SKILLS list:

    tech  =  (>= 3 tech skills)  or  (tech-looking title and >= 1 tech skill)
    ...and a clearly non-tech title ("Civil Engineer", "Sales Manager") blocks the 3-skills route.

Skills are normalised first (app.services.skills, so "ReactJS" -> "react", "k8s" -> "kubernetes"), then looked up in
TECH_SKILLS.  Pure functions, no embeddings, no network.
"""
import re

from app.services.skills import normalize_skill

# One skill per entry (already in the form normalize_skill() produces). Grouped like the aliases in skills.py.
_TECH_LIST = [
    # languages
    "python", "java", "javascript", "typescript", "c", "c++", "c#", "go", "rust", "php", "ruby", "kotlin", "swift", "scala",
    "r", "dart", "matlab", "bash", "shell scripting", "sql", "nosql", "html", "css", "sass", "objective-c",
    # frontend / backend frameworks
    "react", "angular", "vue", "svelte", "next.js", "nuxt.js", "redux", "jquery", "bootstrap", "tailwind css", "webpack", "vite",
    "node.js", "express", "nest.js", "django", "flask", "fastapi", "spring", "spring boot", "hibernate", "asp.net", "dotnet",
    "laravel", "rails", "graphql", "rest api", "microservices", "websockets", "oauth", "jwt",
    # databases / messaging
    "postgresql", "mysql", "sql server", "oracle", "sqlite", "mongodb", "redis", "cassandra", "dynamodb", "elasticsearch",
    "firebase", "kafka", "rabbitmq",
    # devops / cloud
    "docker", "docker compose", "kubernetes", "terraform", "ansible", "jenkins", "github actions", "gitlab ci", "ci cd", "git",
    "linux", "nginx", "prometheus", "grafana", "helm", "infrastructure as code", "elk stack",
    "amazon web services", "azure", "google cloud platform", "cloudformation",
    # data / ML / AI
    "machine learning", "deep learning", "natural language processing", "computer vision", "tensorflow", "pytorch", "keras",
    "scikit-learn", "pandas", "numpy", "apache spark", "hadoop", "airflow", "etl", "data warehouse", "power bi", "tableau",
    "bigquery", "snowflake", "data visualization", "data structures and algorithms", "large language models",
    "generative ai", "hugging face", "opencv", "artificial intelligence",
    # mobile
    "android", "ios", "flutter", "react native", "swiftui", "xcode", "android studio",
    # QA
    "selenium", "cypress", "playwright", "junit", "testng", "pytest", "jest", "mocha", "postman", "jmeter", "rest assured",
    "test automation", "manual testing", "api testing", "bdd", "tdd", "cucumber", "appium",
    # general engineering
    "object oriented programming", "system design",
]
TECH_SKILLS = {normalize_skill(s) for s in _TECH_LIST} - {""}

_TECH_TITLE = re.compile(
    r"\b(software|web|front[\s-]?end|back[\s-]?end|full[\s-]?stack|mobile|android|ios|devops|sre|site reliability|cloud|"
    r"data (?:scientist|analyst|engineer)|machine learning|ml|ai|nlp|qa|sdet|sde|tester|test engineer|automation|"
    r"programmer|developer|java|python|\.net|dotnet|react|node|database|dba|cyber\s?security|security engineer|"
    r"embedded|firmware|platform engineer|systems? (?:engineer|administrator)|network engineer|it support|technical support|"
    r"computer science|information technology|big data|blockchain|ui\s?/?\s?ux)\b", re.I)
_NON_TECH_TITLE = re.compile(
    r"\b(civil|mechanical|chemical|electrical|sales|marketing|accountant|accounting|nurse|teacher|driver|hr|human resources|"
    r"recruiter|customer service|receptionist|chef|cashier|lawyer|attorney|pharmacist|warehouse|construction|operations manager)\b", re.I)

MIN_TECH_SKILLS = 3


def tech_skill_count(skills) -> int:
    seen = {normalize_skill(s) for s in (skills or []) if s is not None}
    return len(seen & TECH_SKILLS)


def is_tech(titles, skills) -> bool:
    """titles: str or list of str (role title; resume: current title + experience titles). skills: list of str."""
    if isinstance(titles, str):
        titles = [titles]
    title = " | ".join(str(t) for t in (titles or []) if t)
    n = tech_skill_count(skills)
    title_tech = bool(_TECH_TITLE.search(title))
    if n >= MIN_TECH_SKILLS and (title_tech or not _NON_TECH_TITLE.search(title)):
        return True
    return title_tech and n >= 1


def resume_is_tech(parsed: dict) -> bool:
    titles = [parsed.get("currentTitle")] + [e.get("title") for e in parsed.get("experience") or [] if isinstance(e, dict)]
    return is_tech(titles, parsed.get("skills"))


def role_is_tech(role: dict) -> bool:
    req = role.get("requirements") or {}
    skills = (req.get("requiredSkills") or []) + (req.get("preferredSkills") or [])
    return is_tech(role.get("title"), skills)