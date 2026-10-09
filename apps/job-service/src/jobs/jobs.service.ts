import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { StorageService } from '../storage/storage.service';
import { CreateJobRoleDto } from './dto/create-job-role.dto';
import { UpdateJobRoleDto } from './dto/update-job-role.dto';
import { Prisma } from '../generated/prisma';

@Injectable()
export class JobsService {
    constructor(
        private prisma: PrismaService,
        private redis: RedisService,
        private storage: StorageService,
    ) { }

    async upload(companyId: string, file: Express.Multer.File) {
        const fileUrl = await this.storage.uploadJobDoc(companyId, file);
        const posting = await this.prisma.jobPosting.create({
            data: { companyId, fileUrl, status: 'pending' },
        });

        await this.redis.client.xadd(
            'jd.uploaded',
            '*',
            'data',
            JSON.stringify({ jobPostingId: posting.id, companyId, fileUrl }),
        );

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
        await this.assertOwnsPosting(jobPostingId, companyId);
        const role = await this.prisma.jobRole.create({
            data: {
                jobPostingId,
                title: dto.title,
                requirements: {
                    title: dto.title,
                    requiredSkills: dto.requiredSkills,
                    preferredSkills: dto.preferredSkills ?? [],
                    minExperienceYears: dto.minExperienceYears ?? null,
                    qualifications: dto.qualifications ?? null,
                } as Prisma.InputJsonValue,
            },
        });
        await this.requestMatching(jobPostingId, companyId, role.id);
        return role;
    }

    async updateRole(roleId: string, companyId: string, dto: UpdateJobRoleDto) {
        const role = await this.prisma.jobRole.findUnique({ where: { id: roleId } });
        if (!role) throw new NotFoundException('Role not found');
        await this.assertOwnsPosting(role.jobPostingId, companyId);

        const existing = (role.requirements as Record<string, any>) || {};
        const merged = { ...existing, ...dto };
        if (dto.title) merged.title = dto.title; // keep requirements.title in sync with the role title

        const updated = await this.prisma.jobRole.update({
            where: { id: roleId },
            data: {
                title: dto.title ?? role.title,
                requirements: merged as Prisma.InputJsonValue,
            },
        });
        await this.requestMatching(role.jobPostingId, companyId, roleId);
        return updated;
    }

    async deleteRole(roleId: string, companyId: string) {
        const role = await this.prisma.jobRole.findUnique({ where: { id: roleId } });
        if (!role) throw new NotFoundException('Role not found');
        await this.assertOwnsPosting(role.jobPostingId, companyId);

        await this.prisma.jobRole.delete({ where: { id: roleId } });

        // results-service drops this role's matches, matching-agent drops its vector (best-effort: delete already succeeded)
        try {
            await this.redis.client.xadd('job.role.deleted', '*', 'data', JSON.stringify({ roleId, jobPostingId: role.jobPostingId }));
        } catch (err) {
            console.error('Failed to publish job.role.deleted', err);
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
            await this.redis.client.xadd('job.stopped', '*', 'data', JSON.stringify({
                jobPostingId, companyId, roleIds: posting?.roles.map((r) => r.id) ?? [],
            }));
        } catch (err) {
            console.error('Failed to publish job.stopped', err);
        }
        return posting;
    }

    /** Company reopens a stopped job: whatever was skipped while it was stopped is picked up now. */
    async reopen(jobPostingId: string, companyId: string) {
        await this.assertOwnsPosting(jobPostingId, companyId);
        const cleared = await this.prisma.jobPosting.updateMany({ where: { id: jobPostingId, stoppedAt: { not: null } }, data: { stoppedAt: null } });
        const posting = await this.prisma.jobPosting.findUnique({ where: { id: jobPostingId }, include: { roles: true } });
        if (!posting || cleared.count === 0) return posting; // was not stopped: nothing to do (no duplicate work)

        try {
            if (posting.status === 'pending') {
                // the document was never scanned (it was stopped first) -> scan it now
                await this.redis.client.xadd('jd.uploaded', '*', 'data', JSON.stringify({ jobPostingId, companyId, fileUrl: posting.fileUrl }));
            } else if (posting.status === 'extracted' && posting.roles.length > 0) {
                // roles exist: match everybody who uploaded a resume while the job was stopped
                await this.redis.client.xadd('jd.extracted', '*', 'data', JSON.stringify({
                    jobPostingId, companyId, roleIds: posting.roles.map((r) => r.id),
                }));
            }
        } catch (err) {
            console.error('Failed to restart processing after reopen', err);
        }
        return posting;
    }

    /**
     * Roles created/edited by hand never went through the JD extractor, so they had no embedding and were
     * never matched (and edits left old vectors/scores behind). 'jd.extracted' makes matching-agent
     * re-embed the role and re-score the candidates. Matching is best-effort: the save itself must not fail.
     */
    private async requestMatching(jobPostingId: string, companyId: string, roleId: string) {
        try {
            await this.redis.client.xadd(
                'jd.extracted',
                '*',
                'data',
                JSON.stringify({ jobPostingId, companyId, roleIds: [roleId] }),
            );
        } catch (err) {
            console.error('Failed to publish jd.extracted for manual role change', err);
        }
    }

    private async assertOwnsPosting(jobPostingId: string, companyId: string) {
        const posting = await this.prisma.jobPosting.findUnique({ where: { id: jobPostingId } });
        if (!posting) throw new NotFoundException('Job posting not found');
        if (posting.companyId !== companyId) throw new ForbiddenException('Not your job posting');
        return posting;
    }
}