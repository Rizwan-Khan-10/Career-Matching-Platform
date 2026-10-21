"""inputHash (contract §4.12): lets matching-agent skip a (resume, role) pair whose inputs did not change.

    sha1(canonical JSON of { resumeId, resume.parsedData, role.title + role.requirements,
                             effective academic values used by the role's rules (only if the role has any academic rule),
                             scorer modelVersion,
                             policy (thresholds, review band, gates: scorer.policy_key()) })

The hash is stored by matching-results-service in RoleScan.inputHash (it arrives in `match.scanned`).
"""
import hashlib
import json


def canonical_json(obj) -> str:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False, default=str)


def content_hash(obj) -> str:
    return hashlib.sha1(canonical_json(obj).encode("utf-8")).hexdigest()


def compute_input_hash(resume_id: str, parsed_data, role_title: str, requirements, model_version: str,
                       academic: dict | None = None, policy: str | None = None) -> str:
    """`academic` = the effective academic values the role's rules read ({"cgpa": 7.2, ...}); None when the role has no
    academic rule, in which case the key is left out entirely (an applicant's profile change then never invalidates the pair)."""
    payload = {
        "resumeId": resume_id,
        "resume": parsed_data or {},
        "role": {"title": role_title or "", "requirements": requirements or {}},
        "modelVersion": model_version,
    }
    if academic is not None:
        payload["academic"] = academic
    if policy is not None:      # scorer.policy_key(): thresholds / review band / gates. None = key left out (old hashes stay valid)
        payload["policy"] = policy
    return content_hash(payload)