"""Compatibility gate: may this resume (target track/stack) be matched with this role? (contract §4.11)

Two forms of the SAME rule, kept side by side so they cannot drift:
  * `is_compatible()`        - plain Python (tests, documentation, any in-memory check)
  * `ROLE_GATE_SQL` / `RESUME_GATE_SQL` - SQL fragments used by vector_search.py, so incompatible pairs
    are removed BEFORE the vector search and never cost any scoring.

Rule:
  - resume target track or stack is "other"  -> compatible (applicant opted out of gating)
  - role track missing / "other"             -> compatible (no gating)
  - tracks must match; frontend/backend/fullstack bridge only through "fullstack"
    (frontend <-> backend never match)
  - role.stacks empty / missing              -> any stack of that track
  - otherwise resume stack must be in role.stacks
"""
import json
import os

LANGUAGE_TRACKS = ("frontend", "backend", "fullstack")
TAXONOMY_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "taxonomy", "tech_roles.json")


def load_taxonomy(path: str = TAXONOMY_PATH) -> dict:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def tracks_compatible(resume_track: str, role_track: str) -> bool:
    if resume_track == role_track:
        return True
    return (resume_track in LANGUAGE_TRACKS and role_track in LANGUAGE_TRACKS
            and "fullstack" in (resume_track, role_track))


def role_gate_values(requirements: dict | None) -> tuple[str, list[str]]:
    """(track, stacks) of a role; a missing / empty track becomes 'other' (= no gating)."""
    req = requirements if isinstance(requirements, dict) else {}
    track = req.get("track")
    stacks = req.get("stacks")
    clean = [s for s in stacks if isinstance(s, str)] if isinstance(stacks, list) else []
    return (track if isinstance(track, str) and track else "other"), clean


def is_compatible(resume_track: str | None, resume_stack: str | None, requirements: dict | None) -> bool:
    resume_track, resume_stack = resume_track or "other", resume_stack or "other"
    if resume_track == "other" or resume_stack == "other":
        return True
    role_track, role_stacks = role_gate_values(requirements)
    if role_track == "other":
        return True
    if not tracks_compatible(resume_track, role_track):
        return False
    return not role_stacks or resume_stack in role_stacks


# --- SQL forms ---------------------------------------------------------------------------------------
# jr = jobs_service."JobRole", r = resumes_service."Resume". CASE (not OR) guards the array functions,
# because Postgres does not promise short-circuit order and jsonb_array_length() errors on non-arrays.
_LANG = "('frontend','backend','fullstack')"

# resume known: params r_track, r_stack  -> filters role rows
ROLE_GATE_SQL = f"""(
    %(r_track)s = 'other' OR %(r_stack)s = 'other'
    OR COALESCE(jr.requirements->>'track', 'other') = 'other'
    OR (
        (jr.requirements->>'track' = %(r_track)s
         OR (%(r_track)s IN {_LANG} AND jr.requirements->>'track' IN {_LANG}
             AND 'fullstack' IN (%(r_track)s, jr.requirements->>'track')))
        AND CASE WHEN jsonb_typeof(jr.requirements->'stacks') = 'array'
                 THEN (jsonb_array_length(jr.requirements->'stacks') = 0
                       OR jr.requirements->'stacks' ? %(r_stack)s)
                 ELSE TRUE END
    )
)"""

# role known: params role_track, role_stacks (text[]), has_stacks -> filters resume rows
RESUME_GATE_SQL = f"""(
    r."targetTrack" = 'other' OR r."targetStack" = 'other'
    OR %(role_track)s = 'other'
    OR (
        (r."targetTrack" = %(role_track)s
         OR (r."targetTrack" IN {_LANG} AND %(role_track)s IN {_LANG}
             AND 'fullstack' IN (r."targetTrack", %(role_track)s)))
        AND (NOT %(has_stacks)s OR r."targetStack" = ANY(%(role_stacks)s::text[]))
    )
)"""

# Active resume (contract §4.9): never "latest parsed".
ACTIVE_RESUME_SQL = """(r.status = 'parsed' AND r."confirmedAt" IS NOT NULL AND r."supersededAt" IS NULL)"""

# Roles that carry at least one academic rule (contract §4.1): absent / null / empty list = rule not set.
ACADEMIC_RULE_SQL = """(
    jsonb_typeof(jr.requirements->'minCgpa') = 'number'
    OR jsonb_typeof(jr.requirements->'maxBacklogs') = 'number'
    OR CASE WHEN jsonb_typeof(jr.requirements->'allowedBranches') = 'array'
            THEN jsonb_array_length(jr.requirements->'allowedBranches') > 0 ELSE FALSE END
    OR CASE WHEN jsonb_typeof(jr.requirements->'passingYears') = 'array'
            THEN jsonb_array_length(jr.requirements->'passingYears') > 0 ELSE FALSE END
)"""