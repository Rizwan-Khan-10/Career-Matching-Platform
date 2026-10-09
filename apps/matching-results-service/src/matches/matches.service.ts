import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { EmailQueueService } from '../queue/email-queue.service';
import { Prisma } from '../generated/prisma';

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
 *   resume.pdf.ready -> company is informed by e-mail; they log in to view/download [onResumePdfReady]
 */
@Injectable()
export class MatchesService {
    constructor(private prisma: PrismaService, private emailQueue: EmailQueueService, private redis: RedisService) { }

    /**
     * Idempotent: the same (applicant, role) pair is UPDATED, never duplicated, so Redis redelivery or a
     * re-upload of the resume can't create duplicate rows. The email only goes out when the pair is new or
     * its eligibility actually changed. applicantStatus is never touched here: a re-score must not undo consent.
     */
    async saveMatchResult(data: MatchComputed) {
        const where = { applicantId_jobRoleId: { applicantId: data.applicantId, jobRoleId: data.jobRoleId } };
        const existing = await this.prisma.match.findUnique({ where });

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
        };

        const match = await this.prisma.match.upsert({
            where,
            create: { applicantId: data.applicantId, jobRoleId: data.jobRoleId, ...fields },
            // an applicant who became eligible no longer needs the old "how to improve" feedback
            update: { ...fields, ...(data.eligible ? { feedback: null } : {}) },
        });

        if (!existing || existing.eligible !== data.eligible) {
            await this.emailQueue.enqueueEligibilityEmail(data.applicantId, data.jobRoleId, data.eligible);
        }
        return match;
    }

    /** matching-agent reports every pair it evaluated (chunked). Idempotent upsert per (role, applicant). */
    async saveScans(data: { scans?: any[] }) {
        const scans = (data?.scans ?? []).filter(
            (x) => x && typeof x.jobRoleId === 'string' && typeof x.applicantId === 'string' && typeof x.eligible === 'boolean' && Number.isFinite(x.score),
        );
        if (scans.length === 0) return;
        await this.prisma.$transaction(
            scans.map((x) =>
                this.prisma.roleScan.upsert({
                    where: { jobRoleId_applicantId: { jobRoleId: x.jobRoleId, applicantId: x.applicantId } },
                    create: { jobRoleId: x.jobRoleId, applicantId: x.applicantId, resumeId: x.resumeId ?? null, eligible: x.eligible, score: x.score },
                    update: { resumeId: x.resumeId ?? null, eligible: x.eligible, score: x.score, scannedAt: new Date() },
                }),
            ),
        );
    }

    async saveFeedback(data: { applicantId: string; jobRoleId: string; feedback: string }) {
        const match = await this.prisma.match.updateMany({
            where: { applicantId: data.applicantId, jobRoleId: data.jobRoleId },
            data: { feedback: data.feedback },
        });
        await this.emailQueue.enqueueFeedbackEmail(data.applicantId, data.feedback);
        return match;
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
            // what a recruiter decided and the raw scoring internals are not the applicant's business
            const { decision, decidedAt, decidedBy, breakdown, ...m } = full;
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
    /** resume-parser-agent finished the PDF -> tell the company by e-mail (no attachment) and light up their dashboard. */
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
            await this.emailQueue.enqueueCandidateReadyEmail({
                companyId: info.companyId,
                matchId: match.id,
                jobRoleId: match.jobRoleId,
                roleTitle: info.title ?? match.roleTitle,
                applicantName: await this.applicantName(match.applicantId),
                score: match.score,
            });
            // no applicantId in this payload on purpose: websocket-gateway then routes it to the COMPANY
            await this.redis.client.xadd('candidate.ready', '*', 'data', JSON.stringify({
                companyId: info.companyId, matchId: match.id, jobRoleId: match.jobRoleId, roleTitle: info.title ?? match.roleTitle,
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

    /** Recruiter shortlists / rejects (or clears) an APPROVED candidate. These verdicts are the real labels for retraining. */
    async setDecision(matchId: string, userId: string, role: string, decision: string | null | undefined) {
        const match = await this.prisma.match.findUnique({ where: { id: matchId } });
        if (!match || match.applicantStatus !== 'approved') throw new NotFoundException('Match not found');
        await this.assertCompanyOwnsRole(match.jobRoleId, userId, role);
        return this.prisma.match.update({
            where: { id: matchId },
            data: decision
                ? { decision, decidedAt: new Date(), decidedBy: userId }
                : { decision: null, decidedAt: null, decidedBy: null },
        });
    }

    /** The role was deleted in job-service -> its matches are meaningless now. */
    async deleteForRole(jobRoleId: string) {
        return this.prisma.match.deleteMany({ where: { jobRoleId } });
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