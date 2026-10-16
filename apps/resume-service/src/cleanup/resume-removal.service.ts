import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { StorageService } from '../storage/storage.service';
import type { Resume } from '../generated/prisma';

export type RemovableResume = Pick<Resume, 'id' | 'applicantId' | 'cloudinaryPublicId' | 'pdfPublicId'>;

/** removed = gone; in_use = an approved match still uses it (nothing touched); files_failed = Cloudinary failed (row kept for a retry) */
export type RemoveOutcome = 'removed' | 'in_use' | 'files_failed';

/**
 * The one routine that removes a resume (contract 5.4 "Storage"): used by confirm (replace), DELETE /resumes/:id,
 * the upload "newer unconfirmed upload" rule and the daily cleanup job.
 */
@Injectable()
export class ResumeRemovalService {
    private readonly logger = new Logger(ResumeRemovalService.name);

    constructor(
        private prisma: PrismaService,
        private redis: RedisService,
        private storage: StorageService,
    ) { }

    /**
     * "Approved match uses it" = matches_service.Match with this resumeId and applicantStatus = 'approved' (read-only SQL).
     * Throws when the check cannot be made: callers must not delete on a guess.
     */
    async isUsedByApprovedMatch(resumeId: string): Promise<boolean> {
        const rows = await this.prisma.$queryRaw<{ ok: number }[]>`
            SELECT 1 AS ok FROM "matches_service"."Match"
            WHERE "resumeId" = ${resumeId} AND "applicantStatus" = 'approved' LIMIT 1`;
        return rows.length > 0;
    }

    /** Removes the resume unless an approved match uses it. */
    async removeIfUnused(resume: RemovableResume): Promise<RemoveOutcome> {
        if (await this.isUsedByApprovedMatch(resume.id)) return 'in_use';
        return (await this.purge(resume)) ? 'removed' : 'files_failed';
    }

    /**
     * Deletes Cloudinary original + generated PDF, the embedding row and the DB row, without checking matches
     * (only for resumes that can never be in a match, e.g. unconfirmed uploads).
     * The DB row stays when Cloudinary fails, so the daily job can retry. Returns true when everything is gone.
     */
    async purge(resume: RemovableResume): Promise<boolean> {
        const filesGone = await this.storage.destroyResumeFiles(resume.cloudinaryPublicId, resume.pdfPublicId);
        if (!filesGone) {
            this.logger.warn(`Could not delete the files of resume ${resume.id}; keeping the row so the cleanup job can retry`);
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

    /** resume.deleted for matching-agent and results-service. Best effort: the resume is already gone. */
    async publishDeleted(resume: Pick<Resume, 'id' | 'applicantId'>): Promise<void> {
        try {
            await this.redis.client.xadd(
                'resume.deleted',
                'MAXLEN',
                '~',
                10000,
                '*',
                'data',
                JSON.stringify({ resumeId: resume.id, applicantId: resume.applicantId, requestId: randomUUID() }),
            );
        } catch (err) {
            this.logger.error(`Failed to publish resume.deleted for ${resume.id}: ${(err as Error).message}`);
        }
    }
}