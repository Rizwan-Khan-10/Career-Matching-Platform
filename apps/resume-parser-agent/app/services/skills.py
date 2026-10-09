"""Skill normalisation helpers.

NOTE: this is NOT keyword matching. Matching is done on embeddings (see features.py).
Normalisation only exists so that (a) obvious spelling variants collapse to one string
("ReactJS" / "React.js" -> "react") and (b) short/ambiguous skill names get a tiny gloss so
the embedding model understands them ("java" vs "javascript", "go", "r", "c").
"""
import re

# alias -> canonical (all lowercase)
ALIASES = {
    "js": "javascript", "es6": "javascript", "ecmascript": "javascript",
    "ts": "typescript",
    "reactjs": "react", "react.js": "react", "react js": "react",
    "vuejs": "vue", "vue.js": "vue", "vue js": "vue",
    "angularjs": "angular", "angular.js": "angular",
    "nodejs": "node.js", "node": "node.js", "node js": "node.js",
    "expressjs": "express", "express.js": "express",
    "nextjs": "next.js", "next": "next.js", "nestjs": "nest.js",
    "py": "python", "python3": "python",
    "k8s": "kubernetes",
    "postgres": "postgresql", "psql": "postgresql", "postgre sql": "postgresql",
    "mongo": "mongodb", "mongo db": "mongodb",
    "ml": "machine learning", "dl": "deep learning",
    "nlp": "natural language processing", "cv": "computer vision",
    "sklearn": "scikit-learn", "scikit learn": "scikit-learn",
    "tf": "tensorflow",
    "gcp": "google cloud platform", "google cloud": "google cloud platform",
    "aws": "amazon web services",
    "ci/cd": "ci cd", "cicd": "ci cd", "ci-cd": "ci cd",
    "html5": "html", "css3": "css",
    "restful api": "rest api", "restful apis": "rest api", "rest apis": "rest api",
    "restful services": "rest api", "rest": "rest api",
    "oop": "object oriented programming", "oops": "object oriented programming",
    "dsa": "data structures and algorithms", "data structures": "data structures and algorithms",
    "golang": "go", "c sharp": "c#", "cpp": "c++",
    "powerbi": "power bi", "ms excel": "excel", "microsoft excel": "excel",
    "ui/ux": "ui ux design", "ux": "ux design", "ui": "ui design",
}

# Short gloss appended ONLY for embedding input — helps the model disambiguate.
GLOSS = {
    "java": "java programming language",
    "javascript": "javascript programming language",
    "typescript": "typescript programming language",
    "python": "python programming language",
    "go": "go golang programming language",
    "r": "r statistical programming language",
    "c": "c programming language",
    "c++": "c++ programming language",
    "c#": "c# dotnet programming language",
    "rust": "rust programming language",
    "swift": "swift ios programming language",
    "kotlin": "kotlin android programming language",
    "react": "react javascript ui library",
    "angular": "angular typescript web framework",
    "vue": "vue javascript web framework",
    "node.js": "node.js javascript backend runtime",
    "express": "express node.js web framework",
    "django": "django python web framework",
    "flask": "flask python web framework",
    "fastapi": "fastapi python web framework",
    "spring boot": "spring boot java backend framework",
    "sql": "sql relational database queries",
    "postgresql": "postgresql relational database",
    "mysql": "mysql relational database",
    "mongodb": "mongodb nosql document database",
    "redis": "redis in-memory cache database",
    "docker": "docker containers",
    "kubernetes": "kubernetes container orchestration",
    "amazon web services": "amazon web services aws cloud",
    "azure": "microsoft azure cloud",
    "google cloud platform": "google cloud platform gcp cloud",
    "tensorflow": "tensorflow deep learning framework",
    "pytorch": "pytorch deep learning framework",
    "flutter": "flutter dart mobile framework",
    "react native": "react native cross platform mobile framework",
    "git": "git version control",
    "linux": "linux operating system administration",
    "excel": "microsoft excel spreadsheets",
    "figma": "figma interface design tool",
}

_WS = re.compile(r"\s+")


def normalize_skill(raw) -> str:
    """lowercase, trim, collapse spaces/punctuation noise, apply alias map. Returns '' for junk."""
    if raw is None:
        return ""
    s = str(raw).strip().lower()
    s = s.strip(" \t\r\n.,;:|•·-–—*()[]{}\"'")
    s = _WS.sub(" ", s)
    if not s or len(s) > 60:
        return ""
    return ALIASES.get(s, s)


def dedupe_skills(skills) -> list:
    """Normalises + removes duplicates while preserving order. Accepts None / non-list safely."""
    if not skills:
        return []
    if isinstance(skills, str):
        skills = re.split(r"[,;\n|/•]+", skills)
    seen, out = set(), []
    for item in skills:
        n = normalize_skill(item)
        if n and n not in seen:
            seen.add(n)
            out.append(n)
    return out


def embedding_text_for_skill(skill: str) -> str:
    """What we actually send to the embedding model for a (normalised) skill."""
    return GLOSS.get(skill, skill)