import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { StorageService } from '../storage/storage.service';

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

    async getRoles(jobPostingId: string) {
        return this.prisma.jobRole.findMany({ where: { jobPostingId } });
    }
}