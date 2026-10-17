import logging
import threading

from app.core import config
from app.core.embeddings import embed_one
from app.core.redis_stream import consume_loop, publish
from app.models.matching import ResumeEvent, ResumeDeletedEvent, ProfileUpdatedEvent, JdExtractedEvent, MatchComputedEvent
from app.services.matcher import evaluate_match, build_resume_side
from app.services.selection import select_for_publish
from app.services.scan_report import scan_entry, chunked
from app.services.profile_text import resume_profile_text, role_profile_text
from app.services.vector_search import (
    ensure_tables, find_compatible_roles_for_resume, find_compatible_resumes_for_role,
    get_role, is_role_active, get_active_resume, get_active_resumes_for_applicant, is_resume_active,
    scanned_role_ids, upsert_resume_embedding, upsert_role_embedding, delete_role_embedding, delete_resume_embedding,
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


def _match_resume(resume: dict, **role_filters):
    """Score ONE active resume against the compatible roles (gate runs in SQL) and publish the result."""
    resume_id, applicant_id, profile = resume["resumeId"], resume["applicantId"], resume["parsedData"]

    # Keep the stored vector in sync with the (possibly edited) parsed data, built the same way as role vectors.
    upsert_resume_embedding(resume_id, embed_one(resume_profile_text(profile)))

    side = build_resume_side(profile)  # embed the resume once, reuse for every role
    scored = []
    for role in find_compatible_roles_for_resume(resume, config.TOP_K_ROLES_PER_RESUME, **role_filters):
        try:
            result = evaluate_match(profile, role["title"], role["requirements"], side=side)
            scored.append({"role": role, "result": result})
        except Exception as exc:  # one bad role must not kill the rest
            log.exception("scoring failed resume=%s role=%s: %s", resume_id, role["jobRoleId"], exc)

    # replaced / deleted while we were scoring: publish nothing (the replacement triggers its own run)
    if not is_resume_active(resume_id):
        log.info("resume %s is no longer active, discarding results", resume_id)
        return
    _publish_scans([scan_entry(s["role"]["jobRoleId"], applicant_id, resume_id, s["result"]) for s in scored])
    for s in select_for_publish(scored, config.MAX_INELIGIBLE_PER_RESUME):
        _publish(applicant_id, s["role"]["jobRoleId"], s["role"]["title"], resume_id, s["result"])
    log.info("resume %s: scored %d roles, eligible=%d", resume_id, len(scored), sum(s["result"].eligible for s in scored))


def handle_resume_event(data: dict):
    """resume.confirmed / resume.updated: that resume vs compatible roles. Inactive resumes are ignored."""
    event = ResumeEvent(**data)
    resume = get_active_resume(event.resumeId)
    if not resume:
        log.info("resume %s is not active (unconfirmed, superseded or deleted), skipping", event.resumeId)
        return
    _match_resume(resume)


def handle_profile_updated(data: dict):
    """profile.updated: that applicant's active resumes vs roles that have academic rules."""
    event = ProfileUpdatedEvent(**data)
    for resume in get_active_resumes_for_applicant(event.applicantId):
        _match_resume(resume, academic_only=True)


def handle_resume_deleted(data: dict):
    """resume.deleted: the applicant's remaining active resumes vs the roles the deleted resume had been scanned against.
    If those scan rows are already gone (matching-results-service also consumes this event) fall back to the normal
    compatible-roles run, so the applicant never loses matches just because of the ordering of two consumers."""
    event = ResumeDeletedEvent(**data)
    role_ids = scanned_role_ids(event.resumeId)
    delete_resume_embedding(event.resumeId)
    for resume in get_active_resumes_for_applicant(event.applicantId):
        _match_resume(resume, **({"role_ids": role_ids} if role_ids else {}))


def handle_jd_extracted(data: dict):
    """jd.extracted: score every compatible ACTIVE resume against each new / edited role."""
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
        for cand in find_compatible_resumes_for_role(role, config.TOP_K_RESUMES_PER_ROLE):
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


CONSUMERS = [  # (stream, consumer name, handler) - resume.parsed is NOT consumed: parsing is not matching
    ("resume.confirmed", "c1", handle_resume_event),
    ("resume.updated", "c3", handle_resume_event),
    ("profile.updated", "c5", handle_profile_updated),
    ("jd.extracted", "c2", handle_jd_extracted),
    ("job.role.deleted", "c4", handle_role_deleted),
    ("resume.deleted", "c6", handle_resume_deleted),
]


def run():
    ensure_tables()
    threads = [
        threading.Thread(target=consume_loop, args=(stream, "matching-agent-group", name, handler), daemon=True)
        for stream, name, handler in CONSUMERS
    ]
    for t in threads:
        t.start()
    for t in threads:
        t.join()