import logging
import threading
from functools import partial

from app.core import config
from app.core.embeddings import embed_one
from app.core.redis_stream import consume_loop, publish
from app.models.matching import ResumeEvent, ResumeDeletedEvent, ProfileUpdatedEvent, JdExtractedEvent, MatchComputedEvent
from app.services import rules, scorer
from app.services.academic import get_academic_profile, get_academic_profiles
from app.services.input_hash import compute_input_hash
from app.services.matcher import evaluate_match
from app.services.retrieval import best_per_applicant, prefilter_skips, scan_best_first
from app.services.run_stats import Run
from app.services.selection import select_for_publish
from app.services.scan_report import scan_entry, chunked
from app.services.side_cache import get_resume_side, get_role_side
from app.services.profile_text import resume_profile_text, role_profile_text
from app.services.vector_search import (
    ensure_tables, find_compatible_roles_for_resume, find_compatible_resumes_for_role,
    count_roles_for_resume, count_resumes_for_role, load_scan_hashes_for_resume, load_scan_hashes_for_role,
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
        unverifiedRules=result.unverifiedRules,
    )
    publish("match.computed", evt.model_dump())


def _publish_scans(entries: list):
    for chunk in chunked(entries):
        publish("match.scanned", {"scans": chunk})


def _match_resume(resume: dict, trigger: str = "resume", force: bool = False, **role_filters):
    """Score ONE active resume against the compatible roles, best similarity first, and publish the result.
    Gate (SQL) -> hash skip -> optional prefilter -> score; stops early (contract §8).
    force=True ignores stored inputHashes (resume.deleted: the pairs may have lost their Match row, so they must be re-published)."""
    resume_id, applicant_id, profile = resume["resumeId"], resume["applicantId"], resume["parsedData"]
    run = Run(trigger, resume_id)

    # Keep the stored vector in sync with the (possibly edited) parsed data, built the same way as role vectors.
    vec = embed_one(resume_profile_text(profile))
    upsert_resume_embedding(resume_id, vec)

    side = get_resume_side(resume_id, profile)  # cached per (resumeId, content hash)
    total, compatible = count_roles_for_resume(resume)
    run.add("gatedOut", total - compatible)
    stored = {} if force else load_scan_hashes_for_resume(resume_id)
    model_version = scorer.model_version()
    role_ids = role_filters.get("role_ids") or []
    top_k = max(config.TOP_K_ROLES_PER_RESUME, len(role_ids))
    scored = []
    _academic = []

    def academic() -> dict | None:
        """The applicant's ApplicantProfile, read lazily and at most once per run (only when a role has academic rules)."""
        if not _academic:
            _academic.append(get_academic_profile(applicant_id))
        return _academic[0]

    def process(rows: list) -> int:
        eligible = 0
        for role in rows:
            role_id, title, req = role["jobRoleId"], role["title"], role["requirements"]
            ruled = rules.has_academic_rules(req)
            acad = academic() if ruled else None
            h = compute_input_hash(resume_id, profile, title, req, model_version,
                                   academic=rules.academic_hash_part(req, profile, acad))
            prev = stored.get(role_id)
            if prev and prev[0] == h:                       # unchanged pair: no scoring, no event
                run.add("skippedByHash")
                eligible += 1 if prev[1] else 0
                continue
            role_side = get_role_side(role_id, title, req)
            if prefilter_skips(side, role_side):
                run.add("prefiltered")
                continue
            try:
                result = evaluate_match(profile, title, req, side=side, role_side=role_side, academic=acad)
            except Exception as exc:  # one bad role must not kill the rest
                log.exception("scoring failed resume=%s role=%s: %s", resume_id, role_id, exc)
                continue
            run.add("scored")
            scored.append({"role": role, "result": result, "hash": h})
            eligible += 1 if result.eligible else 0
        return eligible

    info = scan_best_first(lambda off, lim: find_compatible_roles_for_resume(resume, vec, lim, off, **role_filters),
                           process, top_k=top_k)
    run.add("retrieved", info["retrieved"])
    run.stoppedBy = info["stoppedBy"]
    run.add("eligible", sum(s["result"].eligible for s in scored))

    # replaced / deleted while we were scoring: publish nothing (the replacement triggers its own run)
    if not is_resume_active(resume_id):
        log.info("resume %s is no longer active, discarding results", resume_id)
    else:
        _publish_scans([scan_entry(s["role"]["jobRoleId"], applicant_id, resume_id, s["result"], s["hash"]) for s in scored])
        for s in select_for_publish(scored, config.MAX_INELIGIBLE_PER_RESUME):
            _publish(applicant_id, s["role"]["jobRoleId"], s["role"]["title"], resume_id, s["result"])
    run.finish()


def handle_resume_event(data: dict, trigger: str = "resume.event"):
    """resume.confirmed / resume.updated: that resume vs compatible roles. Inactive resumes are ignored."""
    event = ResumeEvent(**data)
    resume = get_active_resume(event.resumeId)
    if not resume:
        log.info("resume %s is not active (unconfirmed, superseded or deleted), skipping", event.resumeId)
        return
    _match_resume(resume, trigger=trigger)


def handle_profile_updated(data: dict):
    """profile.updated: that applicant's active resumes vs roles that have academic rules."""
    event = ProfileUpdatedEvent(**data)
    for resume in get_active_resumes_for_applicant(event.applicantId):
        _match_resume(resume, trigger="profile.updated", academic_only=True)


def handle_resume_deleted(data: dict):
    """resume.deleted: the applicant's remaining active resumes vs the roles the deleted resume had been scanned against.
    If those scan rows are already gone (matching-results-service also consumes this event) fall back to the normal
    compatible-roles run, so the applicant never loses matches just because of the ordering of two consumers."""
    event = ResumeDeletedEvent(**data)
    role_ids = scanned_role_ids(event.resumeId)
    delete_resume_embedding(event.resumeId)
    for resume in get_active_resumes_for_applicant(event.applicantId):
        # force: the deleted resume may have been the one that held the Match rows, so unchanged hashes must not hide these pairs
        _match_resume(resume, trigger="resume.deleted", force=True, **({"role_ids": role_ids} if role_ids else {}))


def handle_jd_extracted(data: dict):
    """jd.extracted: score compatible ACTIVE resumes against each new / edited role, best similarity first."""
    event = JdExtractedEvent(**data)
    for role_id in event.roleIds:
        role = get_role(role_id)
        if not role:
            log.warning("role %s not found, skipping", role_id)
            continue
        if role["stopped"]:
            log.info("role %s belongs to a stopped job, not matching", role_id)
            continue
        _match_role(role)


def _match_role(role: dict):
    role_id, title, req = role["jobRoleId"], role["title"], role["requirements"]
    run = Run("jd.extracted", role_id)
    # (re)build the role vector with the shared structured text, so retrieval is consistent
    vec = embed_one(role_profile_text(title, req))
    upsert_role_embedding(role_id, vec)

    role_side = get_role_side(role_id, title, req)  # prepared once, reused for every resume
    total, compatible = count_resumes_for_role(role)
    run.add("gatedOut", total - compatible)
    stored = load_scan_hashes_for_role(role_id)
    model_version = scorer.model_version()
    scored = []

    ruled = rules.has_academic_rules(req)

    def process(rows: list) -> int:
        eligible = 0
        # one query for the whole batch, and only when this role has academic rules at all
        academics = get_academic_profiles([c["applicantId"] for c in rows]) if ruled else {}
        for cand in rows:
            acad = academics.get(cand["applicantId"])
            h = compute_input_hash(cand["resumeId"], cand["parsedData"], title, req, model_version,
                                   academic=rules.academic_hash_part(req, cand["parsedData"], acad))
            prev = stored.get(cand["resumeId"])
            if prev and prev[0] == h:                       # unchanged pair: no scoring, no event
                run.add("skippedByHash")
                eligible += 1 if prev[1] else 0
                continue
            side = get_resume_side(cand["resumeId"], cand["parsedData"])
            if prefilter_skips(side, role_side):
                run.add("prefiltered")
                continue
            try:
                result = evaluate_match(cand["parsedData"], title, req, side=side, role_side=role_side, academic=acad)
            except Exception as exc:
                log.exception("scoring failed resume=%s role=%s: %s", cand["resumeId"], role_id, exc)
                continue
            run.add("scored")
            scored.append({"cand": cand, "result": result, "hash": h})
            eligible += 1 if result.eligible else 0
        return eligible

    info = scan_best_first(lambda off, lim: find_compatible_resumes_for_role(role, vec, lim, off),
                           process, top_k=config.TOP_K_RESUMES_PER_ROLE)
    run.add("retrieved", info["retrieved"])
    run.stoppedBy = info["stoppedBy"]
    run.add("eligible", sum(s["result"].eligible for s in scored))

    # the company may have pressed "stop" while we were scoring: then publish nothing at all
    if not is_role_active(role_id):
        log.info("role %s was stopped while matching, discarding results", role_id)
    else:
        # every evaluated pair is reported; only the best resume per applicant is published as a match
        _publish_scans([scan_entry(role_id, s["cand"]["applicantId"], s["cand"]["resumeId"], s["result"], s["hash"]) for s in scored])
        for s in select_for_publish(best_per_applicant(scored), config.MAX_INELIGIBLE_PER_ROLE):
            _publish(s["cand"]["applicantId"], role_id, title, s["cand"]["resumeId"], s["result"])
    run.finish()


def handle_role_deleted(data: dict):
    """job.role.deleted: forget the role's vector so it can never be retrieved again."""
    role_id = data.get("roleId")
    if role_id:
        delete_role_embedding(role_id)
        log.info("role %s deleted, embedding removed", role_id)


CONSUMERS = [  # (stream, consumer name, handler) - resume.parsed is NOT consumed: parsing is not matching
    ("resume.confirmed", "c1", partial(handle_resume_event, trigger="resume.confirmed")),
    ("resume.updated", "c3", partial(handle_resume_event, trigger="resume.updated")),
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