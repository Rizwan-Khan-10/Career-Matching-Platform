from app.core.redis_stream import consume_loop, publish
from app.core.db import get_connection
from app.services.academics import effective_academics
from app.services.gap_analyzer import generate_feedback
from app.services.prep_guide import generate_prep_guide
from app.services.rejection_feedback import GUIDED_REASONS, generate_rejection_feedback
from app.models.feedback import CandidateRejectedEvent, CandidateShortlistedEvent, MatchComputedEvent, PrepReadyEvent, RejectionFeedbackReadyEvent
import logging
import threading
import psycopg2


log = logging.getLogger("feedback.worker")
MIN_SCORE_FOR_FEEDBACK = 0.2
GROUP = "feedback-agent-group"


def _query(sql: str, params: tuple) -> list:
    """One read-only query on its own connection (closed even when the query fails)."""
    conn = get_connection()
    try:
        cur = conn.cursor()
        try:
            cur.execute(sql, params)
            return cur.fetchall()
        finally:
            cur.close()
    finally:
        conn.close()


def get_role_requirements(job_role_id: str) -> dict:
    rows = _query('SELECT requirements FROM "jobs_service"."JobRole" WHERE id = %s', (job_role_id,))
    return rows[0][0] if rows else None


def get_applicant_resume_data(resume_id: str, applicant_id: str) -> dict:
    """parsedData of the resume the match was computed on (NOT the applicant's latest one). The applicant check keeps
    one person's resume from ever being read on behalf of another."""
    rows = _query(
        'SELECT "parsedData" FROM "resumes_service"."Resume" WHERE id = %s AND "applicantId" = %s AND status = \'parsed\'',
        (resume_id, applicant_id),
    )
    return rows[0][0] if rows and rows[0][0] else {}


def get_academic_profile(applicant_id: str) -> dict:
    """Academic columns of the applicant's profile (contract 4.3). Empty when the profile has none or the columns do not exist yet."""
    try:
        rows = _query(
            'SELECT cgpa, branch, "passingYear", backlogs, "academicVerified" FROM "users_service"."ApplicantProfile" WHERE "userId" = %s',
            (applicant_id,),
        )
    except psycopg2.Error as exc:
        log.warning("could not read academic profile of applicant %s: %s", applicant_id, exc)
        return {}
    if not rows:
        return {}
    cgpa, branch, passing_year, backlogs, verified = rows[0]
    return {"cgpa": cgpa, "branch": branch, "passingYear": passing_year, "backlogs": backlogs, "academicVerified": bool(verified)}


def get_match(match_id: str) -> dict | None:
    """The match row written by results-service (read-only): which resume it used and the matching verdict."""
    rows = _query(
        '''SELECT "applicantId", "jobRoleId", "resumeId", score, reason, "matchedSkills", "partialSkills", "missingSkills",
                  "unverifiedRules", decision
           FROM "matches_service"."Match" WHERE id = %s''',
        (match_id,),
    )
    if not rows:
        return None
    keys = ("applicantId", "jobRoleId", "resumeId", "score", "reason", "matchedSkills", "partialSkills", "missingSkills", "unverifiedRules", "decision")
    return dict(zip(keys, rows[0]))


def get_selected_profiles(job_role_id: str, exclude_applicant_id: str, limit: int = 5) -> list:
    """Anonymised benchmark of the best eligible applicants for this role: ONLY skills / years / education, taken from the resume
    each match was computed on. Never their projects, employers or free text - those candidates agreed to share with the company,
    not with other applicants."""
    rows = _query(
        '''SELECT jsonb_build_object(
                  'skills', r."parsedData"->'skills',
                  'experienceYears', r."parsedData"->'experienceYears',
                  'education', r."parsedData"->'education')
           FROM "matches_service"."Match" m
           JOIN "resumes_service"."Resume" r ON r.id = m."resumeId" AND r.status = 'parsed'
           WHERE m."jobRoleId" = %s AND m.eligible = true AND m."applicantId" != %s
           ORDER BY m.score DESC LIMIT %s''',
        (job_role_id, exclude_applicant_id, limit),
    )
    return [r[0] for r in rows]


def handle(data: dict):
    """match.computed -> not-eligible improvement guide -> feedback.ready"""
    event = MatchComputedEvent(**data)  # validates incoming event shape

    if event.eligible:
        return  # feedback only needed for non-eligible outcomes
    if event.score < MIN_SCORE_FOR_FEEDBACK:
        return  # hopeless/unrelated role: advice would be noise and costs an LLM call
    if not event.resumeId:
        log.info("match for applicant %s / role %s names no resume, skipping feedback", event.applicantId, event.jobRoleId)
        return  # never guess "the latest resume": the advice must be about the resume that was actually scored

    requirements = get_role_requirements(event.jobRoleId)
    if requirements is None:
        log.info("role %s no longer exists, skipping feedback", event.jobRoleId)
        return
    applicant_data = get_applicant_resume_data(event.resumeId, event.applicantId)
    if not applicant_data:
        log.info("resume %s is gone or not parsed, skipping feedback", event.resumeId)
        return
    selected = get_selected_profiles(event.jobRoleId, event.applicantId)
    academics = effective_academics(get_academic_profile(event.applicantId), applicant_data)

    analysis = {"reason": event.reason, "missingSkills": event.missingSkills, "partialSkills": event.partialSkills,
                "matchedSkills": event.matchedSkills, "score": event.score, "unverifiedRules": event.unverifiedRules}
    feedback = generate_feedback(applicant_data, requirements, selected, analysis, academics)

    publish("feedback.ready", {
        "applicantId": event.applicantId,
        "jobRoleId": event.jobRoleId,
        "feedback": feedback,
    })


def handle_shortlisted(data: dict):
    """candidate.shortlisted -> AI interview prep guide -> prep.ready. The company's own details (date, place, link, notes)
    reach the candidate through the notification and are never given to the model."""
    event = CandidateShortlistedEvent(**data)

    match = get_match(event.matchId)
    if match is None:
        log.info("match %s no longer exists, skipping prep guide", event.matchId)
        return
    if match["applicantId"] != event.applicantId or match["jobRoleId"] != event.jobRoleId:
        log.warning("match %s does not belong to applicant/role of the event, skipping prep guide", event.matchId)
        return
    if match["decision"] != "shortlisted":
        log.info("match %s is no longer shortlisted, skipping prep guide", event.matchId)
        return  # decision was changed or cleared meanwhile

    requirements = get_role_requirements(event.jobRoleId)
    if requirements is None:
        log.info("role %s no longer exists, skipping prep guide", event.jobRoleId)
        return
    resume = get_applicant_resume_data(match["resumeId"], event.applicantId) if match["resumeId"] else {}

    analysis = {"score": match["score"], "reason": match["reason"] or "", "matchedSkills": match["matchedSkills"] or [],
                "partialSkills": match["partialSkills"] or [], "missingSkills": match["missingSkills"] or [],
                "unverifiedRules": match["unverifiedRules"] or []}
    guide = generate_prep_guide(
        requirements, resume, analysis,
        {"name": event.shortlist.roundName, "mode": event.shortlist.mode},
        event.roleTitle,
    )

    publish("prep.ready", PrepReadyEvent(
        matchId=event.matchId, applicantId=event.applicantId, jobRoleId=event.jobRoleId, guide=guide,
    ).model_dump())


def handle_rejected(data: dict):
    """candidate.rejected -> improvement feedback (skills_gap / experience / resume_quality) or null (position_filled / other)
    -> rejection-feedback.ready. The company's reason only chooses the focus; its note and decision details never reach the model,
    and the benchmark stays anonymous."""
    event = CandidateRejectedEvent(**data)

    match = get_match(event.matchId)
    if match is None:
        log.info("match %s no longer exists, skipping rejection feedback", event.matchId)
        return
    if match["applicantId"] != event.applicantId or match["jobRoleId"] != event.jobRoleId:
        log.warning("match %s does not belong to applicant/role of the event, skipping rejection feedback", event.matchId)
        return
    if match["decision"] != "rejected":
        log.info("match %s is no longer rejected, skipping rejection feedback", event.matchId)
        return  # decision was changed or cleared meanwhile

    feedback = None
    if event.reasonCategory in GUIDED_REASONS:
        requirements = get_role_requirements(event.jobRoleId)
        if requirements is None:
            log.info("role %s no longer exists, skipping rejection feedback", event.jobRoleId)
            return
        resume = get_applicant_resume_data(match["resumeId"], event.applicantId) if match["resumeId"] else {}
        benchmark = get_selected_profiles(event.jobRoleId, event.applicantId)
        analysis = {"score": match["score"], "matchedSkills": match["matchedSkills"] or [], "partialSkills": match["partialSkills"] or [],
                    "missingSkills": match["missingSkills"] or []}
        feedback = generate_rejection_feedback(requirements, resume, benchmark, analysis, event.reasonCategory, event.roleTitle)
    else:
        log.info("reason %s gets no AI feedback", event.reasonCategory)  # position_filled / other (or an unknown category)

    publish("rejection-feedback.ready", RejectionFeedbackReadyEvent(
        matchId=event.matchId, applicantId=event.applicantId, jobRoleId=event.jobRoleId, feedback=feedback,
    ).model_dump())


CONSUMERS = [
    ("match.computed", handle),
    ("candidate.shortlisted", handle_shortlisted),
    ("candidate.rejected", handle_rejected),
]


def run():
    """One daemon thread per stream, each blocking in its own consume loop. Returns only if they all exit (/health then reports it)."""
    threads = [
        threading.Thread(target=consume_loop, args=(stream, GROUP, "consumer-1", handler), name=f"consumer-{stream}", daemon=True)
        for stream, handler in CONSUMERS
    ]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
