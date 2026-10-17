import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { Prisma } from '../generated/prisma';
import { SetDecisionDto, ShortlistDto } from './dto/set-decision.dto';

/** Key-order independent compare of a flat JSON object (Postgres jsonb does not keep key order). */
const canonical = (o: unknown): string => (o && typeof o === 'object' ? JSON.stringify(o, Object.keys(o).sort()) : 'null');

export interface MatchComputed {
    applicantId: string;
    jobRoleId: string;
    roleTitle?: string | null;
    resumeId?: string | null;
    score: number;
    eligible: boolean;
    reason?: string;
    matchedSkills?: string[];
    partialSkills?: string[];
    missingSkills?: string[];
    breakdown?: any;
    modelVersion?: string | null;
    /** academic rules that could not be checked (missing data): names among cgpa, branch, passingYear, backlogs */
    unverifiedRules?: string[];
}

interface ScanInput {
    jobRoleId: string;
    applicantId: string;
    resumeId: string;
    eligible: boolean;
    score: number;
    inputHash?: string | null;
}

interface RoleInfoRow {
    jobRoleId: string;
    title: string | null;
    companyId: string;
    companyName: string | null;
    industry: string | null;
    stopped: boolean;
}

/**
 * FLOW
 *   match.computed  -> Match row (applicantStatus = 'pending')            [saveMatchResult]
 *   applicant sees it, approves  -> 'match.approved' event               [setApproval]
 *   resume-parser-agent makes a PDF of the uploaded resume
 *   resume.pdf.ready -> candidate.ready event; notification-service informs the company; they log in to view/download [onResumePdfReady]
 */
@Injectable()
export class MatchesService {
    constructor(private prisma: PrismaService, private redis: RedisService) { }

    /**
     * Idempotent: the same (applicant, role) pair is UPDATED, never duplicated, so Redis redelivery or a
     * re-upload of the resume can't create duplicate rows. No e-mail is sent from here (notification-service
     * reads match.computed itself). applicantStatus is never touched here: a re-score must not undo consent.
     * When a row already exists, shouldReplace() (contract §5.6) decides whether this result may overwrite it.
     */
    async saveMatchResult(data: MatchComputed) {
        const where = { applicantId_jobRoleId: { applicantId: data.applicantId, jobRoleId: data.jobRoleId } };

        const existing = await this.prisma.match.findUnique({
            where,
            select: { id: true, resumeId: true, score: true, applicantStatus: true },
        });
        if (existing && !(await this.shouldReplace(existing, data))) return existing;

        const fields = {
            roleTitle: data.roleTitle ?? null,
            resumeId: data.resumeId ?? null,
            score: data.score,
            eligible: data.eligible,
            reason: data.reason ?? null,
            matchedSkills: data.matchedSkills ?? [],
            partialSkills: data.partialSkills ?? [],
            missingSkills: data.missingSkills ?? [],
            breakdown: data.breakdown ?? undefined,
            modelVersion: data.modelVersion ?? null,
            // always overwritten: a re-score with complete data must clear the old "could not verify" list
            unverifiedRules: Array.isArray(data.unverifiedRules) ? data.unverifiedRules.filter((r) => typeof r === 'string') : [],
        };

        return await this.prisma.match.upsert({
            where,
            create: { applicantId: data.applicantId, jobRoleId: data.jobRoleId, ...fields },
            // an applicant who became eligible no longer needs the old "how to improve" feedback
            update: { ...fields, ...(data.eligible ? { feedback: null } : {}) },
        });
    }

    /**
     * matching-agent reports every (role, resume) pair it evaluated (chunked). Idempotent upsert per
     * (jobRoleId, resumeId); inputHash is stored so the agent can skip unchanged pairs next time.
     */
    async saveScans(data: { scans?: Partial<ScanInput>[] }) {
        const scans = (data?.scans ?? []).filter(
            (x): x is ScanInput =>
                !!x && typeof x.jobRoleId === 'string' && typeof x.applicantId === 'string' && typeof x.resumeId === 'string' &&
                typeof x.eligible === 'boolean' && Number.isFinite(x.score),
        );
        if (scans.length === 0) return;
        await this.prisma.$transaction(
            scans.map((x) =>
                this.prisma.roleScan.upsert({
                    where: { jobRoleId_resumeId: { jobRoleId: x.jobRoleId, resumeId: x.resumeId } },
                    create: { jobRoleId: x.jobRoleId, applicantId: x.applicantId, resumeId: x.resumeId, eligible: x.eligible, score: x.score, inputHash: x.inputHash ?? null },
                    update: { applicantId: x.applicantId, eligible: x.eligible, score: x.score, inputHash: x.inputHash ?? null, scannedAt: new Date() },
                }),
            ),
        );
    }

    async saveFeedback(data: { applicantId: string; jobRoleId: string; feedback: string }) {
        const match = await this.prisma.match.findUnique({
            where: { applicantId_jobRoleId: { applicantId: data.applicantId, jobRoleId: data.jobRoleId } },
        });
        // not saved yet (or the role was deleted): throw so handleWithRetry retries with back-off, then dead-letters
        if (!match) throw new Error(`match ${data.applicantId}/${data.jobRoleId} not found for feedback`);
        if (match.eligible) return; // became eligible meanwhile: "how to improve" is obsolete
        await this.prisma.match.update({ where: { id: match.id }, data: { feedback: data.feedback } });
    }

    // ------------------------------------------------------------------ reads
    /** Applicant's own matches + WHICH COMPANY each one is for (that's what they approve). */
    async getForApplicant(applicantId: string) {
        const matches = await this.prisma.match.findMany({
            where: { applicantId },
            orderBy: [{ eligible: 'desc' }, { score: 'desc' }],
        });
        const info = await this.roleInfo(matches.map((m) => m.jobRoleId));
        return matches.map((full) => {
            // what a recruiter decided (incl. the reject reason / note) and the raw scoring internals are not the applicant's business
            const { decision, decidedAt, decidedBy, breakdown, rejectReason, rejectMessage, ...m } = full;
            const r = info.get(m.jobRoleId);
            return { ...m, roleTitle: r?.title ?? m.roleTitle, companyName: r?.companyName || 'A hiring company', companyIndustry: r?.industry ?? null, jobStopped: r?.stopped ?? false };
        });
    }

    /** Company side: ONLY candidates who approved sharing, best first. Nothing else about an applicant is visible. */
    getForJobRole(jobRoleId: string) {
        return this.prisma.match.findMany({
            where: { jobRoleId, eligible: true, applicantStatus: 'approved' },
            orderBy: [{ score: 'desc' }],
        });
    }

    // ------------------------------------------------------------------ consent
    async setApproval(matchId: string, userId: string, approved: boolean) {
        const match = await this.prisma.match.findUnique({ where: { id: matchId } });
        if (!match) throw new NotFoundException('Match not found');
        if (match.applicantId !== userId) throw new ForbiddenException('Not your match');

        if (!approved) {
            if (match.applicantStatus === 'approved') {
                throw new ConflictException('You already shared your resume with this company, this cannot be undone');
            }
            return this.prisma.match.update({ where: { id: matchId }, data: { applicantStatus: 'declined' } });
        }

        if (!match.eligible) throw new BadRequestException('Only matches where you are eligible can be approved');
        // the company stopped this job: nobody can apply any more (already-approved ones stay as they are)
        if (match.applicantStatus !== 'approved' && (await this.roleInfo([match.jobRoleId])).get(match.jobRoleId)?.stopped) {
            throw new ConflictException('This job is no longer accepting applications');
        }

        if (match.applicantStatus === 'approved') {
            // idempotent; the only thing a repeated click may do is retry a resume that failed to convert
            if (match.resumeStatus !== 'failed') return match;
            await this.prisma.match.update({ where: { id: matchId }, data: { resumeStatus: 'none' } });
            await this.publishApproved(match);
            return { ...match, resumeStatus: 'none' };
        }

        // atomic: two quick clicks must not publish two events
        const claimed = await this.prisma.match.updateMany({
            where: { id: matchId, applicantStatus: { not: 'approved' } },
            data: { applicantStatus: 'approved', approvedAt: new Date(), resumeStatus: 'none' },
        });
        if (claimed.count === 0) return this.prisma.match.findUnique({ where: { id: matchId } });

        try {
            await this.publishApproved(match);
        } catch (err) {
            // no event = resume would never be sent -> undo, so the applicant can simply press the button again
            await this.prisma.match.update({ where: { id: matchId }, data: { applicantStatus: match.applicantStatus, approvedAt: null } });
            throw new ServiceUnavailableException('Could not start sharing your resume, please try again');
        }
        return this.prisma.match.findUnique({ where: { id: matchId } });
    }

    private async publishApproved(match: { id: string; applicantId: string; jobRoleId: string; resumeId: string | null }) {
        const info = await this.roleInfo([match.jobRoleId]);
        await this.redis.client.xadd(
            'match.approved', '*', 'data',
            JSON.stringify({
                matchId: match.id,
                applicantId: match.applicantId,
                jobRoleId: match.jobRoleId,
                resumeId: match.resumeId,
                companyId: info.get(match.jobRoleId)?.companyId ?? null,
            }),
        );
    }

    // ------------------------------------------------------------------ PDF pipeline results
    /** resume-parser-agent finished the PDF -> publish candidate.ready (company notification + dashboard). */
    async onResumePdfReady(data: { matchId: string; resumeId?: string; pdfPublicId: string; fileName: string }) {
        const match = await this.prisma.match.findUnique({ where: { id: data.matchId } });
        if (!match || match.applicantStatus !== 'approved') return;

        const claimed = await this.prisma.match.updateMany({
            where: { id: match.id, resumeStatus: { not: 'ready' } },
            data: { resumeStatus: 'ready', resumeSharedAt: new Date(), ...(data.resumeId ? { resumeId: data.resumeId } : {}) },
        });
        if (claimed.count === 0) return; // duplicate event: already delivered

        try {
            const info = (await this.roleInfo([match.jobRoleId])).get(match.jobRoleId);
            if (!info?.companyId) throw new Error(`company of role ${match.jobRoleId} not found`);
            // no applicantId in this payload on purpose: websocket-gateway then routes it to the COMPANY.
            // notification-service turns this event into the in-app notification AND the e-mail (contract §7).
            await this.redis.client.xadd('candidate.ready', '*', 'data', JSON.stringify({
                companyId: info.companyId,
                matchId: match.id,
                jobRoleId: match.jobRoleId,
                roleTitle: info.title ?? match.roleTitle,
                applicantName: await this.applicantName(match.applicantId),
                score: match.score,
            }));
        } catch (err) {
            await this.prisma.match.update({ where: { id: match.id }, data: { resumeStatus: 'none', resumeSharedAt: null } });
            throw err; // consumer retries
        }
    }

    async onResumePdfFailed(data: { matchId: string; reason?: string }) {
        await this.prisma.match.updateMany({
            where: { id: data.matchId, resumeStatus: { not: 'ready' } },
            data: { resumeStatus: 'failed' },
        });
    }

    // ------------------------------------------------------------------ recruiter decisions (training labels)
    /**
     * Companies may only touch roles of their own postings. Roles live in the jobs_service schema of the same
     * database (matching-agent already reads it the same way), so ownership is one cheap query.
     */
    async assertCompanyOwnsRole(jobRoleId: string, userId: string, role: string) {
        if ((role || '').toUpperCase() === 'ADMIN') return;
        const rows = await this.prisma.$queryRaw<{ ok: number }[]>`
            SELECT 1 AS ok FROM "jobs_service"."JobRole" jr
            JOIN "jobs_service"."JobPosting" jp ON jp.id = jr."jobPostingId"
            WHERE jr.id = ${jobRoleId} AND jp."companyId" = ${userId}
            LIMIT 1`;
        if (rows.length === 0) throw new ForbiddenException('Not your job role');
    }

    /**
     * Recruiter shortlists / rejects (or clears) an APPROVED candidate of one of the company's own roles. These
     * verdicts are the real labels for retraining. Anything else (unknown, not approved, other company's role) is a
     * 404 / 403 so a company can never probe matches it must not see.
     *
     * Saving a shortlist / rejection publishes candidate.shortlisted / candidate.rejected (contract §7); if the event
     * cannot be published the change is rolled back, so the applicant is never left without the news. Sending the
     * very same decision again is a no-op (no second event). `{ decision: null }` clears everything and sends no event.
     */
    async setDecision(matchId: string, userId: string, role: string, dto: SetDecisionDto) {
        const match = await this.prisma.match.findUnique({ where: { id: matchId } });
        if (!match || match.applicantStatus !== 'approved') throw new NotFoundException('Match not found');
        await this.assertCompanyOwnsRole(match.jobRoleId, userId, role);

        const decision = dto.decision ?? null;
        if (decision === null) {
            if (!match.decision) return match; // nothing to clear
            return this.prisma.match.update({ where: { id: matchId }, data: this.clearedDecision() });
        }

        const shortlist = decision === 'shortlisted' ? this.cleanShortlist(dto.shortlist) : null;
        const rejection = decision === 'rejected' ? { reasonCategory: dto.rejection!.reasonCategory, message: dto.rejection!.message || null } : null;

        const unchanged = decision === 'shortlisted'
            ? match.decision === 'shortlisted' && canonical(match.shortlistInfo) === canonical(shortlist)
            : match.decision === 'rejected' && match.rejectReason === rejection!.reasonCategory && (match.rejectMessage ?? null) === rejection!.message;
        if (unchanged) return match;

        const previous: Prisma.MatchUpdateInput = {
            decision: match.decision, decidedAt: match.decidedAt, decidedBy: match.decidedBy,
            shortlistInfo: match.shortlistInfo === null ? Prisma.DbNull : (match.shortlistInfo as Prisma.InputJsonValue),
            rejectReason: match.rejectReason, rejectMessage: match.rejectMessage,
            prepGuide: match.prepGuide, rejectionFeedback: match.rejectionFeedback,
        };
        const updated = await this.prisma.match.update({
            where: { id: matchId },
            data: {
                decision, decidedAt: new Date(), decidedBy: userId,
                shortlistInfo: shortlist ? (shortlist as Prisma.InputJsonObject) : Prisma.DbNull,
                rejectReason: rejection?.reasonCategory ?? null,
                rejectMessage: rejection?.message ?? null,
                // the AI guide of the OTHER outcome (or of the old details) no longer fits; feedback-agent writes a fresh one
                prepGuide: null,
                rejectionFeedback: null,
            },
        });

        try {
            await this.publishDecision(updated, shortlist, rejection);
        } catch (err) {
            await this.prisma.match.update({ where: { id: matchId }, data: previous });
            throw new ServiceUnavailableException('Could not save the decision, please try again');
        }
        return updated;
    }

    private clearedDecision(): Prisma.MatchUpdateInput {
        return {
            decision: null, decidedAt: null, decidedBy: null,
            shortlistInfo: Prisma.DbNull, rejectReason: null, rejectMessage: null,
            prepGuide: null, rejectionFeedback: null,
        };
    }

    /** Only the known fields, trimmed, empty ones dropped (what the applicant sees verbatim). */
    private cleanShortlist(s: ShortlistDto | undefined): Record<string, string> {
        const out: Record<string, string> = {};
        for (const key of ['roundName', 'mode', 'scheduledAt', 'bring', 'link', 'address', 'note'] as const) {
            const v = s?.[key];
            if (typeof v === 'string' && v.trim() !== '') out[key] = v.trim();
        }
        return out;
    }

    /** candidate.shortlisted / candidate.rejected (contract §7). companyName comes from users_service.CompanyProfile. */
    private async publishDecision(
        match: { id: string; applicantId: string; jobRoleId: string; roleTitle: string | null },
        shortlist: Record<string, string> | null,
        rejection: { reasonCategory: string; message: string | null } | null,
    ) {
        const info = (await this.roleInfo([match.jobRoleId])).get(match.jobRoleId);
        if (!info?.companyId) throw new Error(`company of role ${match.jobRoleId} not found`);
        const base = {
            matchId: match.id,
            applicantId: match.applicantId,
            jobRoleId: match.jobRoleId,
            companyId: info.companyId,
            roleTitle: info.title ?? match.roleTitle,
        };
        if (shortlist) {
            await this.redis.client.xadd('candidate.shortlisted', '*', 'data', JSON.stringify({ ...base, companyName: info.companyName ?? null, shortlist }));
        } else if (rejection) {
            await this.redis.client.xadd('candidate.rejected', '*', 'data', JSON.stringify({
                ...base, reasonCategory: rejection.reasonCategory, ...(rejection.message ? { message: rejection.message } : {}),
            }));
        }
    }

    /**
     * Replacement rule for an existing (applicant, role) match (contract §5.6):
     *   1. approved  -> the shared resume is frozen: refresh only when it is the SAME resume, ignore any other one
     *   2. otherwise replace when: same resume, OR strictly better score, OR the existing resume is no longer active
     *   3. else keep the existing row
     * The (cheap) resume lookup only runs when the first checks could not already decide.
     */
    private async shouldReplace(existing: { resumeId: string | null; score: number; applicantStatus: string }, data: MatchComputed): Promise<boolean> {
        const sameResume = existing.resumeId === (data.resumeId ?? null);
        if (existing.applicantStatus === 'approved') return sameResume;
        if (sameResume || data.score > existing.score) return true;
        return !(await this.isResumeActive(existing.resumeId));
    }

    /** Active resume (contract §4.9) = parsed + confirmed + not superseded. A deleted resume has no row at all -> not active. */
    private async isResumeActive(resumeId: string | null): Promise<boolean> {
        if (!resumeId) return false;
        const rows = await this.prisma.$queryRaw<{ ok: boolean }[]>(Prisma.sql`
            SELECT TRUE AS ok FROM "resumes_service"."Resume"
            WHERE id = ${resumeId} AND status = 'parsed' AND "confirmedAt" IS NOT NULL AND "supersededAt" IS NULL
            LIMIT 1`);
        return rows.length > 0;
    }

    /**
     * resume.superseded / resume.deleted: everything computed from that resume is stale. Delete its NON-approved
     * matches (an approved one is frozen, the company may already hold the resume) and ALL its scan rows.
     * Idempotent, so Redis redelivery is harmless.
     */
    async onResumeRemoved(data: { resumeId?: string; applicantId?: string }) {
        if (!data || typeof data.resumeId !== 'string' || !data.resumeId) return;
        const resumeId = data.resumeId;
        await this.prisma.$transaction([
            this.prisma.match.deleteMany({ where: { resumeId, applicantStatus: { not: 'approved' } } }),
            this.prisma.roleScan.deleteMany({ where: { resumeId } }),
        ]);
    }

    /** The role was deleted in job-service -> its matches AND its scan rows (dashboard numbers) are meaningless now. */
    async deleteForRole(jobRoleId: string) {
        const [matches] = await this.prisma.$transaction([
            this.prisma.match.deleteMany({ where: { jobRoleId } }),
            this.prisma.roleScan.deleteMany({ where: { jobRoleId } }),
        ]);
        return matches;
    }

    // ------------------------------------------------------------------ cross-schema lookups (same DB)
    private async roleInfo(roleIds: string[]): Promise<Map<string, RoleInfoRow>> {
        const ids = [...new Set(roleIds)];
        if (ids.length === 0) return new Map();
        const rows = await this.prisma.$queryRaw<RoleInfoRow[]>(Prisma.sql`
            SELECT jr.id AS "jobRoleId", jr.title AS title, jp."companyId" AS "companyId",
                   cp.name AS "companyName", cp.industry AS industry,
                   (jp."stoppedAt" IS NOT NULL) AS stopped
            FROM "jobs_service"."JobRole" jr
            JOIN "jobs_service"."JobPosting" jp ON jp.id = jr."jobPostingId"
            LEFT JOIN "users_service"."CompanyProfile" cp ON cp."userId" = jp."companyId"
            WHERE jr.id IN (${Prisma.join(ids)})`);
        return new Map(rows.map((r) => [r.jobRoleId, r]));
    }

    private async applicantName(applicantId: string): Promise<string | null> {
        const rows = await this.prisma.$queryRaw<{ name: string | null }[]>`
            SELECT name FROM "users_service"."ApplicantProfile" WHERE "userId" = ${applicantId} LIMIT 1`;
        return rows[0]?.name || null;
    }
}