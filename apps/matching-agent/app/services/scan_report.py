"""Compact 'who was evaluated against which role' records.

Matches are only published for eligible / near-miss pairs, but dashboards (company + admin) need the FULL funnel:
how many applicants were scanned, how many matched. So every evaluated pair is reported (tiny record) in
'match.scanned' events, chunked so one Redis message never gets huge.
"""

SCAN_CHUNK = 200


def scan_entry(job_role_id: str, applicant_id: str, resume_id, result) -> dict:
    return {
        "jobRoleId": job_role_id,
        "applicantId": applicant_id,
        "resumeId": resume_id,
        "eligible": bool(result.eligible),
        "score": float(result.score),
    }


def chunked(items: list, size: int = SCAN_CHUNK):
    for i in range(0, len(items), size):
        yield items[i:i + size]