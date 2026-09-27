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
        return this.prisma.jobRole.create({
            data: {
                jobPostingId,
                title: dto.title,
                requirements: {
                    title: dto.title,
                    requiredSkills: dto.requiredSkills,
                    minExperienceYears: dto.minExperienceYears ?? null,
                    qualifications: dto.qualifications ?? null,
                } as Prisma.InputJsonValue,
            },
        });
    }

    async updateRole(roleId: string, companyId: string, dto: UpdateJobRoleDto) {
        const role = await this.prisma.jobRole.findUnique({ where: { id: roleId } });
        if (!role) throw new NotFoundException('Role not found');
        await this.assertOwnsPosting(role.jobPostingId, companyId);

        const existing = (role.requirements as Record<string, any>) || {};
        const merged = { ...existing, ...dto };

        return this.prisma.jobRole.update({
            where: { id: roleId },
            data: {
                title: dto.title ?? role.title,
                requirements: merged as Prisma.InputJsonValue,
            },
        });
    }

    async deleteRole(roleId: string, companyId: string) {
        const role = await this.prisma.jobRole.findUnique({ where: { id: roleId } });
        if (!role) throw new NotFoundException('Role not found');
        await this.assertOwnsPosting(role.jobPostingId, companyId);

        await this.prisma.jobRole.delete({ where: { id: roleId } });
        return { deleted: true };
    }

    private async assertOwnsPosting(jobPostingId: string, companyId: string) {
        const posting = await this.prisma.jobPosting.findUnique({ where: { id: jobPostingId } });
        if (!posting) throw new NotFoundException('Job posting not found');
        if (posting.companyId !== companyId) throw new ForbiddenException('Not your job posting');
        return posting;
    }
}