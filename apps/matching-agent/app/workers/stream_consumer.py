import threading
from app.core.redis_stream import consume_loop, publish
from app.services.vector_search import find_matching_roles_for_resume, find_matching_resumes_for_role
from app.services.matcher import evaluate_match
from app.models.matching import ResumeParsedEvent, JdExtractedEvent


def handle_resume_parsed(data: dict):
    event = ResumeParsedEvent(**data)  # validates incoming event shape
    candidate_roles = find_matching_roles_for_resume(event.resumeId)

    for role in candidate_roles[:5]:  # cap LLM calls — vector search already shortlisted
        result = evaluate_match(event.model_dump(), role["requirements"])
        publish("match.computed", {
            "applicantId": event.applicantId,
            "jobRoleId": role["jobRoleId"],
            "score": result.score,
            "eligible": result.eligible,
        })


def handle_jd_extracted(data: dict):
    event = JdExtractedEvent(**data)  # validates incoming event shape

    for role_id in event.roleIds:
        candidates = find_matching_resumes_for_role(role_id)
        for candidate in candidates[:20]:
            result = evaluate_match(candidate["parsedData"], {"jobRoleId": role_id})
            publish("match.computed", {
                "applicantId": candidate["applicantId"],
                "jobRoleId": role_id,
                "score": result.score,
                "eligible": result.eligible,
            })


def run():
    t1 = threading.Thread(
        target=lambda: consume_loop("resume.parsed", "matching-agent-group", "c1", handle_resume_parsed),
        daemon=True,
    )
    t2 = threading.Thread(
        target=lambda: consume_loop("jd.extracted", "matching-agent-group", "c2", handle_jd_extracted),
        daemon=True,
    )
    t1.start()
    t2.start()
    t1.join()
    t2.join()