import {
    Injectable, ForbiddenException, NotFoundException, BadRequestException, ConflictException, Logger, ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { StorageService } from '../storage/storage.service';
import { CreateJobRoleDto } from './dto/create-job-role.dto';
import { UpdateJobRoleDto } from './dto/update-job-role.dto';
import { Prisma } from '../generated/prisma';
import { validateUpload } from '../common/upload';
import { roleTargetError } from '../taxonomy/taxonomy';
import { AuthSettingsService } from '../settings/auth-settings.service';
import { OutgoingEvent, publishEvent, publishEvents } from '../common/events';
import { SetJobApprovalDto } from './dto/set-job-approval.dto';

/** Empty list = "rule not set" for these (an empty allow-list must never mean "nobody is allowed"). */
const EMPTY_MEANS_UNSET = ['allowedBranches', 'passingYears'] as const;

function normalizeRequirements(req: Record<string, any>): Record<string, any> {
    const out = { ...req };
    for (const key of EMPTY_MEANS_UNSET) {
        if (Array.isArray(out[key]) && out[key].length === 0) out[key] = null;
    }
    // salary: currency / period only make sense with an amount (default INR per year); no amount = all four cleared
    const hasSalary = out.salaryMin != null || out.salaryMax != null;
    if (hasSalary) {
        out.salaryCurrency = out.salaryCurrency ?? 'INR';
        out.salaryPeriod = out.salaryPeriod ?? 'year';
    } else if ('salaryMin' in out || 'salaryMax' in out || 'salaryCurrency' in out || 'salaryPeriod' in out) {
        out.salaryMin = null;
        out.salaryMax = null;
        out.salaryCurrency = null;
        out.salaryPeriod = null;
    }
    return out;
}

/** The company's experience band: max must not be below min (both optional; null / missing = not set). */
export function experienceBandError(min: unknown, max: unknown): string | null {
    if (typeof min === 'number' && typeof max === 'number' && max < min) {
        return `maxExperienceYears (${max}) cannot be below minExperienceYears (${min})`;
    }
    return null;
}

/** Salary range: max must not be below min (both optional). */
export function salaryBandError(min: unknown, max: unknown): string | null {
    if (typeof min === 'number' && typeof max === 'number' && max < min) {
        return `salaryMax (${max}) cannot be below salaryMin (${min})`;
    }
    return null;
}

function assertValidSalaryBand(requirements: Record<string, any>) {
    const error = salaryBandError(requirements.salaryMin, requirements.salaryMax);
    if (error) throw new BadRequestException(error);
}

function assertValidExperienceBand(requirements: Record<string, any>) {
    const error = experienceBandError(requirements.minExperienceYears, requirements.maxExperienceYears);
    if (error) throw new BadRequestException(error);
}

function assertValidTarget(track: unknown, stacks: unknown) {
    const error = roleTargetError(track, stacks);
    if (error) throw new BadRequestException(error);
}

@Injectable()
export class JobsService {
    private readonly logger = new Logger(JobsService.name);

    constructor(
        private prisma: PrismaService,
        private redis: RedisService,
        private storage: StorageService,
        private settings: AuthSettingsService,
    ) { }

    /**
     * Stores the document and creates the posting. When the admin approval of postings is switched on
     * (`jobApprovalRequired`, auth-service) the posting waits as `pending` and `jd.uploaded` is NOT published, so nothing
     * is scanned or matched until an admin approves it.
     */
    async upload(companyId: string, file: Express.Multer.File) {
        validateUpload(file);
        // asked BEFORE the file is stored: when the setting cannot be read (503) nothing is left behind
        const approvalRequired = await this.settings.jobApprovalRequired();
        const fileUrl = await this.storage.uploadJobDoc(companyId, file);
        const posting = await this.prisma.jobPosting.create({
            data: { companyId, fileUrl, status: 'pending', approvalStatus: approvalRequired ? 'pending' : 'approved' },
        });

        if (!approvalRequired) {
            await publishEvent(this.redis, 'jd.uploaded', { jobPostingId: posting.id, companyId, fileUrl });
        }

        return posting;
    }

    async getByCompany(companyId: string) {
        return this.prisma.jobPosting.findMany({
            where: { companyId },
            include: { roles: true },
            orderBy: { createdAt: 'desc' },
        });
    }

    async getRoles(jobPostingId: string, companyId: string) {
        await this.assertOwnsPosting(jobPostingId, companyId);
        return this.prisma.jobRole.findMany({ where: { jobPostingId } });
    }

    async createRole(jobPostingId: string, companyId: string, dto: CreateJobRoleDto) {
        const posting = await this.assertOwnsPosting(jobPostingId, companyId);
        assertValidTarget(dto.track, dto.stacks);
        assertValidExperienceBand({ minExperienceYears: dto.minExperienceYears, maxExperienceYears: dto.maxExperienceYears });
        assertValidSalaryBand({ salaryMin: dto.salaryMin, salaryMax: dto.salaryMax });
        const role = await this.prisma.jobRole.create({
            data: {
                jobPostingId,
                title: dto.title,
                requirements: normalizeRequirements({
                    title: dto.title,
                    summary: dto.summary ?? null,
                    requiredSkills: dto.requiredSkills,
                    preferredSkills: dto.preferredSkills ?? [],
                    minExperienceYears: dto.minExperienceYears ?? null,
                    maxExperienceYears: dto.maxExperienceYears ?? null,       // null = no upper limit
                    strictMinExperience: dto.strictMinExperience ?? null,
                    salaryMin: dto.salaryMin ?? null,
                    salaryMax: dto.salaryMax ?? null,
                    salaryCurrency: dto.salaryCurrency ?? null,
                    salaryPeriod: dto.salaryPeriod ?? null,
                    qualifications: dto.qualifications ?? null,
                    responsibilities: dto.responsibilities ?? [],
                    level: dto.level ?? null,
                    track: dto.track ?? null,
                    stacks: dto.stacks ?? [], // [] = any stack of the track
                    minCgpa: dto.minCgpa ?? null,
                    allowedBranches: dto.allowedBranches ?? null,
                    passingYears: dto.passingYears ?? null,
                    maxBacklogs: dto.maxBacklogs ?? null,
                }) as Prisma.InputJsonValue,
            },
        });
        await this.requestMatching(posting, role.id);
        return role;
    }

    async updateRole(roleId: string, companyId: string, dto: UpdateJobRoleDto) {
        const role = await this.prisma.jobRole.findUnique({ where: { id: roleId } });
        if (!role) throw new NotFoundException('Role not found');
        const posting = await this.assertOwnsPosting(role.jobPostingId, companyId);

        // keys that were not sent must not touch the stored value (class-transformer may leave them as undefined)
        const changes = Object.fromEntries(Object.entries(dto).filter(([, v]) => v !== undefined));
        const existing = (role.requirements as Record<string, any>) || {};
        const merged = normalizeRequirements({ ...existing, ...changes });
        if (dto.title) merged.title = dto.title; // keep requirements.title in sync with the role title
        // only when this request touches them: an old role with odd stored values can still be renamed
        if ('track' in changes || 'stacks' in changes) assertValidTarget(merged.track, merged.stacks);
        // same idea for the experience band: checked on the merged values, only when this request touches them
        if ('minExperienceYears' in changes || 'maxExperienceYears' in changes) assertValidExperienceBand(merged);
        if ('salaryMin' in changes || 'salaryMax' in changes) assertValidSalaryBand(merged);

        const updated = await this.prisma.jobRole.update({
            where: { id: roleId },
            data: {
                title: dto.title ?? role.title,
                requirements: merged as Prisma.InputJsonValue,
            },
        });
        await this.requestMatching(posting, roleId);
        return updated;
    }

    async deleteRole(roleId: string, companyId: string) {
        const role = await this.prisma.jobRole.findUnique({ where: { id: roleId } });
        if (!role) throw new NotFoundException('Role not found');
        await this.assertOwnsPosting(role.jobPostingId, companyId);

        await this.prisma.jobRole.delete({ where: { id: roleId } });

        // results-service drops this role's matches, matching-agent drops its vector (best-effort: delete already succeeded)
        try {
            await publishEvent(this.redis, 'job.role.deleted', { roleId, jobPostingId: role.jobPostingId });
        } catch (err) {
            this.logger.error(`Failed to publish job.role.deleted: ${(err as Error).message}`);
        }
        return { deleted: true };
    }

    /**
     * Company stops a job: from now on its document is not scanned (jd-extractor skips it) and no resume is
     * matched against its roles (matching-agent skips it). Existing data stays; applicants can no longer approve.
     */
    async stop(jobPostingId: string, companyId: string) {
        await this.assertOwnsPosting(jobPostingId, companyId);
        await this.prisma.jobPosting.updateMany({ where: { id: jobPostingId, stoppedAt: null }, data: { stoppedAt: new Date() } });
        const posting = await this.prisma.jobPosting.findUnique({ where: { id: jobPostingId }, include: { roles: true } });
        try {
            await publishEvent(this.redis, 'job.stopped', { jobPostingId, companyId, roleIds: posting?.roles.map((r) => r.id) ?? [] });
        } catch (err) {
            this.logger.error(`Failed to publish job.stopped: ${(err as Error).message}`);
        }
        return posting;
    }

    /**
     * Company reopens a stopped job: whatever was skipped while it was stopped is picked up now.
     * A posting that is still waiting for (or was refused) the admin approval is reopened but NOT processed.
     */
    async reopen(jobPostingId: string, companyId: string) {
        await this.assertOwnsPosting(jobPostingId, companyId);
        const cleared = await this.prisma.jobPosting.updateMany({ where: { id: jobPostingId, stoppedAt: { not: null } }, data: { stoppedAt: null } });
        const posting = await this.prisma.jobPosting.findUnique({ where: { id: jobPostingId }, include: { roles: true } });
        if (!posting || cleared.count === 0) return posting; // was not stopped: nothing to do (no duplicate work)
        if (posting.approvalStatus !== 'approved') return posting;

        try {
            if (posting.status === 'pending') {
                // the document was never scanned (it was stopped first) -> scan it now
                await publishEvent(this.redis, 'jd.uploaded', { jobPostingId, companyId, fileUrl: posting.fileUrl });
            } else if (posting.status === 'extracted' && posting.roles.length > 0) {
                // roles exist: match everybody who uploaded a resume while the job was stopped
                await publishEvent(this.redis, 'jd.extracted', { jobPostingId, companyId, roleIds: posting.roles.map((r) => r.id) });
            }
        } catch (err) {
            this.logger.error(`Failed to restart processing after reopen: ${(err as Error).message}`);
        }
        return posting;
    }

    // ------------------------------------------------------------------ admin approval of postings (contract 5.5)

    /** Postings waiting for an admin decision, oldest first. */
    async listPending() {
        return this.prisma.jobPosting.findMany({
            where: { approvalStatus: 'pending' },
            include: { roles: true },
            orderBy: { createdAt: 'asc' },
        });
    }

    /**
     * Admin approves / rejects a posting. Approving releases it: `jd.uploaded` (scan the document) and / or `jd.extracted`
     * (match the roles that already exist), then `job.approval.changed` for the company, all in ONE Redis transaction: if it
     * cannot be published the decision is rolled back (503), so the admin can simply press the button again.
     * Deciding the same way twice is a no-op. An approved posting is live (data exists, applicants may see matches), so it
     * cannot be turned into "rejected": the company stops it instead.
     */
    async decideApproval(jobPostingId: string, dto: SetJobApprovalDto) {
        const posting = await this.prisma.jobPosting.findUnique({ where: { id: jobPostingId }, include: { roles: true } });
        if (!posting) throw new NotFoundException('Job posting not found');

        const target = dto.approved ? 'approved' : 'rejected';
        const note = dto.note?.trim() || null;
        if (posting.approvalStatus === target) return posting;
        if (posting.approvalStatus === 'approved') {
            throw new ConflictException('This posting is already approved and live. The company can stop it.');
        }

        // compare-and-set: two admins (or a double click) can never both "win" and publish twice
        const changed = await this.prisma.jobPosting.updateMany({
            where: { id: jobPostingId, approvalStatus: posting.approvalStatus },
            data: { approvalStatus: target, approvalNote: note },
        });
        if (changed.count === 0) return this.prisma.jobPosting.findUnique({ where: { id: jobPostingId }, include: { roles: true } });

        const events: OutgoingEvent[] = [];
        if (target === 'approved' && !posting.stoppedAt) events.push(...this.releaseEvents(posting));
        events.push({
            stream: 'job.approval.changed',
            payload: { companyId: posting.companyId, jobPostingId, status: target, ...(note ? { note } : {}) },
        });
        try {
            await publishEvents(this.redis, events);
        } catch (err) {
            this.logger.error(`Could not publish the approval of ${jobPostingId}, rolling it back: ${(err as Error).message}`);
            await this.prisma.jobPosting
                .updateMany({ where: { id: jobPostingId, approvalStatus: target }, data: { approvalStatus: posting.approvalStatus, approvalNote: posting.approvalNote } })
                .catch((e: Error) => this.logger.error(`Rollback of ${jobPostingId} failed: ${e.message}`));
            throw new ServiceUnavailableException('Could not publish the decision right now. Nothing was changed, please try again.');
        }
        return this.prisma.jobPosting.findUnique({ where: { id: jobPostingId }, include: { roles: true } });
    }

    /** What an approved posting needs to start: scan the document (if it was never scanned) and match the roles that exist. */
    private releaseEvents(posting: { id: string; companyId: string; fileUrl: string; status: string; roles: { id: string }[] }): OutgoingEvent[] {
        const events: OutgoingEvent[] = [];
        if (posting.status === 'pending') {
            events.push({ stream: 'jd.uploaded', payload: { jobPostingId: posting.id, companyId: posting.companyId, fileUrl: posting.fileUrl } });
        }
        if (posting.roles.length > 0) {
            events.push({ stream: 'jd.extracted', payload: { jobPostingId: posting.id, companyId: posting.companyId, roleIds: posting.roles.map((r) => r.id) } });
        }
        return events;
    }

    /**
     * Roles created/edited by hand never went through the JD extractor, so they had no embedding and were
     * never matched (and edits left old vectors/scores behind). 'jd.extracted' makes matching-agent
     * re-embed the role and re-score the candidates. Matching is best-effort: the save itself must not fail.
     */
    private async requestMatching(posting: { id: string; companyId: string; approvalStatus: string }, roleId: string) {
        // a posting that waits for (or was refused) the admin approval is never matched: nobody may see it yet
        if (posting.approvalStatus !== 'approved') return;
        try {
            await publishEvent(this.redis, 'jd.extracted', { jobPostingId: posting.id, companyId: posting.companyId, roleIds: [roleId] });
        } catch (err) {
            this.logger.error(`Failed to publish jd.extracted for manual role change: ${(err as Error).message}`);
        }
    }

    private async assertOwnsPosting(jobPostingId: string, companyId: string) {
        const posting = await this.prisma.jobPosting.findUnique({ where: { id: jobPostingId } });
        if (!posting) throw new NotFoundException('Job posting not found');
        if (posting.companyId !== companyId) throw new ForbiddenException('Not your job posting');
        return posting;
    }
}