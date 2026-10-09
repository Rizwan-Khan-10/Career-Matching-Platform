import logging
import threading

from app.core import config
from app.core.embeddings import embed_one
from app.core.redis_stream import consume_loop, publish
from app.models.matching import ResumeParsedEvent, JdExtractedEvent, MatchComputedEvent
from app.services.matcher import evaluate_match, build_resume_side
from app.services.selection import select_for_publish
from app.services.scan_report import scan_entry, chunked
from app.services.profile_text import resume_profile_text, role_profile_text
from app.services.vector_search import (
    ensure_tables, find_matching_roles_for_resume, find_matching_resumes_for_role,
    get_role, is_role_active, upsert_resume_embedding, upsert_role_embedding, delete_role_embedding,
)

log = logging.getLogger("matching.worker")


def _publish(applicant_id: str, role_id: str, role_title: str, resume_id: str, result):
    evt = MatchComputedEvent(
        applicantId=applicant_id, jobRoleId=role_id, roleTitle=role_title, resumeId=resume_id,
        score=result.score, eligible=result.eligible, reason=result.reason,
        matchedSkills=result.matchedSkills, partialSkills=result.partialSkills,
        missingSkills=result.missingSkills, breakdown=result.breakdown, modelVersion=result.modelVersion,
    )
    publish("match.computed", evt.model_dump())


def _publish_scans(entries: list):
    for chunk in chunked(entries):
        publish("match.scanned", {"scans": chunk})


def handle_resume_event(data: dict):
    """resume.parsed / resume.updated: score ONE resume against the most similar roles."""
    event = ResumeParsedEvent(**data)
    profile = event.profile()

    # Keep the stored vector in sync with the (possibly edited) parsed data, built the same way as role vectors.
    upsert_resume_embedding(event.resumeId, embed_one(resume_profile_text(profile)))

    side = build_resume_side(profile)  # embed the resume once, reuse for every role
    scored = []
    for role in find_matching_roles_for_resume(event.resumeId, config.TOP_K_ROLES_PER_RESUME):
        try:
            result = evaluate_match(profile, role["title"], role["requirements"], side=side)
            scored.append({"role": role, "result": result})
        except Exception as exc:  # one bad role must not kill the rest
            log.exception("scoring failed resume=%s role=%s: %s", event.resumeId, role["jobRoleId"], exc)

    _publish_scans([scan_entry(s["role"]["jobRoleId"], event.applicantId, event.resumeId, s["result"]) for s in scored])
    for s in select_for_publish(scored, config.MAX_INELIGIBLE_PER_RESUME):
        _publish(event.applicantId, s["role"]["jobRoleId"], s["role"]["title"], event.resumeId, s["result"])
    log.info("resume %s: scored %d roles, eligible=%d", event.resumeId, len(scored), sum(s["result"].eligible for s in scored))


def handle_jd_extracted(data: dict):
    """jd.extracted: score every candidate (latest resume per applicant) against each NEW role."""
    event = JdExtractedEvent(**data)
    for role_id in event.roleIds:
        role = get_role(role_id)
        if not role:
            log.warning("role %s not found, skipping", role_id)
            continue
        if role["stopped"]:
            log.info("role %s belongs to a stopped job, not matching", role_id)
            continue
        # (re)build the role vector with the shared structured text, so retrieval is consistent
        upsert_role_embedding(role_id, embed_one(role_profile_text(role["title"], role["requirements"])))

        scored = []
        for cand in find_matching_resumes_for_role(role_id, config.TOP_K_RESUMES_PER_ROLE):
            try:
                result = evaluate_match(cand["parsedData"], role["title"], role["requirements"])
                scored.append({"cand": cand, "result": result})
            except Exception as exc:
                log.exception("scoring failed resume=%s role=%s: %s", cand["resumeId"], role_id, exc)

        # the company may have pressed "stop" while we were scoring: then publish nothing at all
        if not is_role_active(role_id):
            log.info("role %s was stopped while matching, discarding results", role_id)
            continue
        _publish_scans([scan_entry(role_id, s["cand"]["applicantId"], s["cand"]["resumeId"], s["result"]) for s in scored])
        for s in select_for_publish(scored, config.MAX_INELIGIBLE_PER_ROLE):
            _publish(s["cand"]["applicantId"], role_id, role["title"], s["cand"]["resumeId"], s["result"])
        log.info("role %s: scored %d candidates, eligible=%d", role_id, len(scored), sum(s["result"].eligible for s in scored))


def handle_role_deleted(data: dict):
    """job.role.deleted: forget the role's vector so it can never be retrieved again."""
    role_id = data.get("roleId")
    if role_id:
        delete_role_embedding(role_id)
        log.info("role %s deleted, embedding removed", role_id)


def run():
    ensure_tables()
    threads = [
        threading.Thread(target=lambda: consume_loop("resume.parsed", "matching-agent-group", "c1", handle_resume_event), daemon=True),
        threading.Thread(target=lambda: consume_loop("resume.updated", "matching-agent-group", "c3", handle_resume_event), daemon=True),
        threading.Thread(target=lambda: consume_loop("jd.extracted", "matching-agent-group", "c2", handle_jd_extracted), daemon=True),
        threading.Thread(target=lambda: consume_loop("job.role.deleted", "matching-agent-group", "c4", handle_role_deleted), daemon=True),
    ]
    for t in threads:
        t.start()
    for t in threads:
        t.join()