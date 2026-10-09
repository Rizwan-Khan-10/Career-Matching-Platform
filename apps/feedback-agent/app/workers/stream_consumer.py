from app.core.redis_stream import consume_loop, publish
from app.core.db import get_connection
from app.services.gap_analyzer import generate_feedback
from app.models.feedback import MatchComputedEvent


MIN_SCORE_FOR_FEEDBACK = 0.2


def get_role_requirements(job_role_id: str) -> dict:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute('SELECT requirements FROM "jobs_service"."JobRole" WHERE id = %s', (job_role_id,))
    row = cur.fetchone()
    cur.close()
    conn.close()
    return row[0] if row else {}


def get_applicant_resume_data(applicant_id: str) -> dict:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        'SELECT "parsedData" FROM "resumes_service"."Resume" WHERE "applicantId" = %s AND status = \'parsed\' ORDER BY "createdAt" DESC LIMIT 1',
        (applicant_id,),
    )
    row = cur.fetchone()
    cur.close()
    conn.close()
    return row[0] if row else {}


def get_selected_profiles(job_role_id: str, exclude_applicant_id: str, limit: int = 5) -> list:
    """Parsed data of the best eligible applicants for this role (latest resume of each, highest score first)."""
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        '''SELECT r."parsedData" FROM "matches_service"."Match" m
           JOIN LATERAL (
               SELECT "parsedData" FROM "resumes_service"."Resume"
               WHERE "applicantId" = m."applicantId" AND status = 'parsed'
               ORDER BY "createdAt" DESC LIMIT 1
           ) r ON TRUE
           WHERE m."jobRoleId" = %s AND m.eligible = true AND m."applicantId" != %s
           ORDER BY m.score DESC LIMIT %s''',
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
    if event.score < MIN_SCORE_FOR_FEEDBACK:
        return  # hopeless/unrelated role: advice would be noise and costs an LLM call

    requirements = get_role_requirements(event.jobRoleId)
    applicant_data = get_applicant_resume_data(event.applicantId)
    selected = get_selected_profiles(event.jobRoleId, event.applicantId)

    analysis = {"reason": event.reason, "missingSkills": event.missingSkills, "partialSkills": event.partialSkills,
                "matchedSkills": event.matchedSkills, "score": event.score}
    feedback = generate_feedback(applicant_data, requirements, selected, analysis)

    publish("feedback.ready", {
        "applicantId": event.applicantId,
        "jobRoleId": event.jobRoleId,
        "feedback": feedback,
    })


def run():
    consume_loop("match.computed", "feedback-agent-group", "consumer-1", handle)