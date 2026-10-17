"""Read-only access to the applicants' academic data (users_service.ApplicantProfile, contract 4.3).

Only the four academic columns + the `academicVerified` flag are read; the combination with the resume value
(verified > resume > self) is done in rules.effective_value().
"""
from app.core.db import get_conn

_COLS = ("cgpa", "branch", "passingYear", "backlogs", "academicVerified")


def get_academic_profiles(applicant_ids: list) -> dict:
    """{applicantId: {cgpa, branch, passingYear, backlogs, academicVerified}} for the applicants that have a profile row.
    Applicants without a row are simply absent -> every rule value falls back to the resume or to 'unknown'."""
    ids = sorted({str(a) for a in applicant_ids if a})
    if not ids:
        return {}
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            'SELECT "userId", cgpa, branch, "passingYear", backlogs, "academicVerified" '
            'FROM "users_service"."ApplicantProfile" WHERE "userId" = ANY(%s)',
            (ids,),
        )
        rows = cur.fetchall()
    return {r[0]: dict(zip(_COLS, r[1:])) for r in rows}


def get_academic_profile(applicant_id: str) -> dict | None:
    return get_academic_profiles([applicant_id]).get(str(applicant_id))