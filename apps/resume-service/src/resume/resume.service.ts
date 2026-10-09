import { Injectable, ForbiddenException, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { StorageService } from '../storage/storage.service';
import { UpdateResumeDto } from './dto/update-resume.dto';
import { Prisma } from '../generated/prisma';

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

        const updated = await this.prisma.resume.update({
            where: { id: resumeId },
            data: { parsedData: mergedData as Prisma.InputJsonValue },
        });

        // The applicant corrected their parsed data -> matching-agent re-embeds the resume and re-scores it.
        // (only for resumes that finished parsing; a pending/failed one has nothing to match yet)
        if (resume.status === 'parsed') {
            try {
                await this.redis.client.xadd(
                    'resume.updated',
                    '*',
                    'data',
                    JSON.stringify({ ...mergedData, resumeId: resume.id, applicantId }),
                );
            } catch (err) {
                // saving the edit already succeeded; a failed re-match event must not turn it into a 500
                console.error('Failed to publish resume.updated', err);
            }
        }

        return updated;
    }

    /**
     * Company downloads the PDF of a resume the applicant APPROVED sharing with them.
     * Allowed only if an approved + eligible match for exactly this resume exists on one of the company's roles.
     * (matches/jobs live in other schemas of the same database, like the agents already assume.)
     */
    async getSharedPdfLink(resumeId: string, userId: string, role: string) {
        const resume = await this.prisma.resume.findUnique({ where: { id: resumeId } });
        if (!resume) throw new NotFoundException('Resume not found');

        if ((role || '').toUpperCase() !== 'ADMIN') {
            const allowed = await this.prisma.$queryRaw<{ ok: number }[]>`
                SELECT 1 AS ok FROM "matches_service"."Match" m
                JOIN "jobs_service"."JobRole" jr ON jr.id = m."jobRoleId"
                JOIN "jobs_service"."JobPosting" jp ON jp.id = jr."jobPostingId"
                WHERE m."resumeId" = ${resumeId} AND m."applicantStatus" = 'approved' AND m.eligible = true
                  AND jp."companyId" = ${userId}
                LIMIT 1`;
            if (allowed.length === 0) throw new ForbiddenException('This applicant has not shared their resume with you');
        }
        if (!resume.pdfPublicId) throw new ConflictException('The PDF is still being prepared, try again in a moment');

        return {
            url: this.storage.getSignedUrl(resume.pdfPublicId, 'pdf'),
            fileName: this.friendlyPdfName(resume.cloudinaryPublicId),
            expiresInSeconds: 15 * 60,
        };
    }

    private friendlyPdfName(publicId: string): string {
        const name = publicId.split('/').pop() ?? 'Resume';
        const base = name.replace(/^\d{10,}-/, '').replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
        return `${(base || 'Resume').slice(0, 80)}.pdf`;
    }
}