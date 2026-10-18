import { Injectable, ForbiddenException, NotFoundException, ConflictException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { StorageService } from '../storage/storage.service';
import { UpdateResumeDto } from './dto/update-resume.dto';
import { Prisma } from '../generated/prisma';
import type { Resume } from '../generated/prisma';
import { UploadResumeDto } from './dto/upload-resume.dto';
import { buildTargetKey, isValidTarget, targetLabel } from '../taxonomy/taxonomy';
import { validateUpload } from '../common/upload';

export const MAX_RESUMES_PER_APPLICANT = 5;

@Injectable()
export class ResumeService {
    private readonly logger = new Logger(ResumeService.name);

    constructor(
        private prisma: PrismaService,
        private redis: RedisService,
        private storage: StorageService,
    ) { }

    async upload(applicantId: string, file: Express.Multer.File, dto: UploadResumeDto) {
        validateUpload(file);
        if (!isValidTarget(dto.targetTrack, dto.targetStack)) {
            throw new BadRequestException(`Stack "${dto.targetStack}" does not belong to track "${dto.targetTrack}"`);
        }
        const targetKey = buildTargetKey(dto.targetTrack, dto.targetStack);

        // An older unconfirmed upload for the same target is replaced by this one, so it does not count against the cap.
        const stale = await this.prisma.resume.findMany({
            where: { applicantId, targetKey, confirmedAt: null, supersededAt: null },
        });
        const kept = await this.prisma.resume.count({
            where: { applicantId, supersededAt: null, ...(stale.length ? { id: { notIn: stale.map((r) => r.id) } } : {}) },
        });
        if (kept >= MAX_RESUMES_PER_APPLICANT) {
            throw new ConflictException(`You can keep at most ${MAX_RESUMES_PER_APPLICANT} resumes. Delete one before uploading another.`);
        }

        const { publicId, fileUrl } = await this.storage.uploadResume(applicantId, file);
        const resume = await this.prisma.resume.create({
            data: {
                applicantId,
                cloudinaryPublicId: publicId,
                fileUrl,
                status: 'pending',
                targetTrack: dto.targetTrack,
                targetStack: dto.targetStack,
                targetKey,
            },
        });

        await this.redis.client.xadd(
            'resume.uploaded',
            'MAXLEN',
            '~',
            10000,
            '*',
            'data',
            JSON.stringify({ resumeId: resume.id, applicantId, fileUrl }),
        );

        for (const old of stale) await this.removeUnconfirmed(old);

        return this.withLabel(resume);
    }

    async getByApplicant(applicantId: string) {
        const resumes = await this.prisma.resume.findMany({ where: { applicantId }, orderBy: { createdAt: 'desc' } });
        return resumes.map((r) => this.withLabel(r));
    }

    private withLabel<T extends Pick<Resume, 'targetTrack' | 'targetStack'>>(resume: T) {
        return { ...resume, targetLabel: targetLabel(resume.targetTrack, resume.targetStack) };
    }

    /**
     * Removes an unconfirmed upload completely: Cloudinary original + PDF, embedding row, DB row.
     * The DB row stays when Cloudinary fails, so the cleanup job (task 2.3) can retry.
     */
    private async removeUnconfirmed(resume: Resume): Promise<boolean> {
        const filesGone = await this.storage.destroyResumeFiles(resume.cloudinaryPublicId, resume.pdfPublicId);
        if (!filesGone) {
            this.logger.warn(`Could not delete files of replaced upload ${resume.id}; leaving the row for the cleanup job`);
            return false;
        }
        try {
            await this.prisma.$executeRaw`DELETE FROM resume_embeddings WHERE resume_id = ${resume.id}::uuid`;
        } catch {
            // table is created by the parser/matching agents; it may not exist yet
        }
        await this.prisma.resume.delete({ where: { id: resume.id } });
        return true;
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