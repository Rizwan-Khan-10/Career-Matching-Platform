from app.core.redis_stream import consume_loop, publish
from app.core.db import get_connection
from app.services.gap_analyzer import generate_feedback
from app.models.feedback import MatchComputedEvent


def get_role_requirements(job_role_id: str) -> dict:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute('SELECT requirements FROM "jobs"."JobRole" WHERE id = %s', (job_role_id,))
    row = cur.fetchone()
    cur.close()
    conn.close()
    return row[0] if row else {}


def get_applicant_resume_data(applicant_id: str) -> dict:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        'SELECT "parsedData" FROM "resumes"."Resume" WHERE "applicantId" = %s ORDER BY "createdAt" DESC LIMIT 1',
        (applicant_id,),
    )
    row = cur.fetchone()
    cur.close()
    conn.close()
    return row[0] if row else {}


def get_selected_profiles(job_role_id: str, exclude_applicant_id: str, limit: int = 5) -> list:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        '''SELECT r."parsedData" FROM "matches"."Match" m
           JOIN "resumes"."Resume" r ON r."applicantId" = m."applicantId"
           WHERE m."jobRoleId" = %s AND m.eligible = true AND m."applicantId" != %s
           ORDER BY r."createdAt" DESC LIMIT %s''',
        (job_role_id, exclude_applicant_id, limit),
    )
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return [r[0] for r in rows]


def handle(data: dict):
    event = MatchComputedEvent(**data)  # validates incoming event shape

    if event.eligible:
        return  # feedback only needed for non-eligible outcomes

    requirements = get_role_requirements(event.jobRoleId)
    applicant_data = get_applicant_resume_data(event.applicantId)
    selected = get_selected_profiles(event.jobRoleId, event.applicantId)

    feedback = generate_feedback(applicant_data, requirements, selected)

    publish("feedback.ready", {
        "applicantId": event.applicantId,
        "jobRoleId": event.jobRoleId,
        "feedback": feedback,
    })


def run():
    consume_loop("match.computed", "feedback-agent-group", "consumer-1", handle)
