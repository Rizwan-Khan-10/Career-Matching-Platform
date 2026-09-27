import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { StorageService } from '../storage/storage.service';
import { UpdateResumeDto } from './dto/update-resume.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class ResumeService {
    constructor(
        private prisma: PrismaService,
        private redis: RedisService,
        private storage: StorageService,
    ) { }

    async upload(applicantId: string, file: Express.Multer.File) {
        const { publicId, fileUrl } = await this.storage.uploadResume(applicantId, file);
        const resume = await this.prisma.resume.create({
            data: { applicantId, cloudinaryPublicId: publicId, fileUrl, status: 'pending' },
        });

        await this.redis.client.xadd(
            'resume.uploaded',
            '*',
            'data',
            JSON.stringify({ resumeId: resume.id, applicantId, fileUrl }),
        );

        return resume;
    }

    async getByApplicant(applicantId: string) {
        return this.prisma.resume.findMany({ where: { applicantId }, orderBy: { createdAt: 'desc' } });
    }

    async updateOwn(resumeId: string, applicantId: string, dto: UpdateResumeDto) {
        const resume = await this.prisma.resume.findUnique({ where: { id: resumeId } });
        if (!resume) throw new NotFoundException('Resume not found');
        if (resume.applicantId !== applicantId) throw new ForbiddenException('Not your resume');

        const existingData = (resume.parsedData as Record<string, any>) || {};
        const mergedData = { ...existingData, ...dto };

        return this.prisma.resume.update({
            where: { id: resumeId },
            data: { parsedData: mergedData as Prisma.InputJsonValue },
        });
    }
}