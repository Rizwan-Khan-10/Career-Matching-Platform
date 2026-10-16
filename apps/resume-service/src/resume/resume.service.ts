import {
    Injectable,
    ForbiddenException,
    NotFoundException,
    ConflictException,
    BadRequestException,
    ServiceUnavailableException,
    Logger,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { StorageService } from '../storage/storage.service';
import { ResumeRemovalService, RemoveOutcome } from '../cleanup/resume-removal.service';
import { UpdateResumeDto } from './dto/update-resume.dto';
import { Prisma } from '../generated/prisma';
import type { Resume } from '../generated/prisma';
import { UploadResumeDto } from './dto/upload-resume.dto';
import { buildTargetKey, isValidTarget, targetLabel } from '../taxonomy/taxonomy';
import { validateUpload } from '../common/upload';

export const MAX_RESUMES_PER_APPLICANT = 5;

function hasSkills(parsedData: unknown): boolean {
    const skills = (parsedData as { skills?: unknown } | null)?.skills;
    return Array.isArray(skills) && skills.some((s) => typeof s === 'string' && s.trim().length > 0);
}

@Injectable()
export class ResumeService {
    private readonly logger = new Logger(ResumeService.name);

    constructor(
        private prisma: PrismaService,
        private redis: RedisService,
        private storage: StorageService,
        private removal: ResumeRemovalService,
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

        // an unconfirmed upload can never be in a match, so no approved-match check is needed
        for (const old of stale) await this.removal.purge(old);

        return this.withLabel(resume);
    }

    async getByApplicant(applicantId: string) {
        const resumes = await this.prisma.resume.findMany({ where: { applicantId }, orderBy: { createdAt: 'desc' } });
        return resumes.map((r) => this.withLabel(r));
    }

    /**
     * Confirm = the applicant says "this parsed data is right, match me with it" (contract 5.4).
     * The resume it replaces (same target key) is marked superseded in the SAME transaction, so there is never
     * more than one active resume per (applicant, targetKey). Files are removed after the commit.
     */
    async confirm(resumeId: string, applicantId: string) {
        const resume = await this.findOwned(resumeId, applicantId);
        if (resume.supersededAt) throw new ConflictException('This resume has already been replaced by a newer one');
        if (resume.status !== 'parsed') {
            throw new BadRequestException(`Only a parsed resume can be confirmed (current status: ${resume.status})`);
        }
        if (!hasSkills(resume.parsedData)) {
            throw new BadRequestException('Add at least one skill before confirming your resume');
        }

        const requestId = randomUUID();

        // Already confirmed: nothing to change, but re-publish so a confirm whose event was lost can be retried safely
        // (matching-agent skips unchanged pairs by inputHash, so this is cheap).
        if (resume.confirmedAt) {
            await this.publishConfirmed(resume, requestId);
            return this.withLabel(resume);
        }

        const { confirmed, replaced } = await this.confirmInTransaction(resume);

        for (const old of replaced) {
            await this.publishBestEffort('resume.superseded', { resumeId: old.id, applicantId, requestId });
        }
        await this.publishConfirmed(confirmed, requestId);
        for (const old of replaced) await this.removeReplaced(old);

        return this.withLabel(confirmed);
    }

    private confirmInTransaction(resume: Resume): Promise<{ confirmed: Resume; replaced: Resume[] }> {
        return this.prisma.$transaction(async (tx) => {
            // serialises parallel confirms for the same applicant + target role
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${resume.applicantId}:${resume.targetKey}`}))`;

            const current = await tx.resume.findUnique({ where: { id: resume.id } });
            if (!current || current.confirmedAt) return { confirmed: current ?? resume, replaced: [] }; // lost a race: already done

            const now = new Date();
            const replaced = await tx.resume.findMany({
                where: {
                    applicantId: resume.applicantId,
                    targetKey: resume.targetKey,
                    confirmedAt: { not: null },
                    supersededAt: null,
                    id: { not: resume.id },
                },
            });
            if (replaced.length) {
                await tx.resume.updateMany({ where: { id: { in: replaced.map((r) => r.id) } }, data: { supersededAt: now } });
            }
            const confirmed = await tx.resume.update({ where: { id: resume.id }, data: { confirmedAt: now } });
            return { confirmed, replaced };
        });
    }

    private async publishConfirmed(resume: Resume, requestId: string) {
        try {
            await this.publish('resume.confirmed', {
                resumeId: resume.id,
                applicantId: resume.applicantId,
                targetTrack: resume.targetTrack,
                targetStack: resume.targetStack,
                requestId,
            });
        } catch (err) {
            this.logger.error(`Failed to publish resume.confirmed for ${resume.id}: ${(err as Error).message}`);
            throw new ServiceUnavailableException('Your resume is confirmed but matching could not be started. Please press confirm again.');
        }
    }

    private async publish(stream: string, payload: Record<string, unknown>) {
        await this.redis.client.xadd(stream, 'MAXLEN', '~', 10000, '*', 'data', JSON.stringify(payload));
    }

    private async publishBestEffort(stream: string, payload: Record<string, unknown>) {
        try {
            await this.publish(stream, payload);
        } catch (err) {
            // the DB change already succeeded; results-service also treats a superseded resume as inactive (contract 5.6 rule 2)
            this.logger.error(`Failed to publish ${stream}: ${(err as Error).message}`);
        }
    }

    private withLabel<T extends Pick<Resume, 'targetTrack' | 'targetStack'>>(resume: T) {
        return { ...resume, targetLabel: targetLabel(resume.targetTrack, resume.targetStack) };
    }

    private async findOwned(resumeId: string, applicantId: string): Promise<Resume> {
        const resume = await this.prisma.resume.findUnique({ where: { id: resumeId } });
        if (!resume) throw new NotFoundException('Resume not found');
        if (resume.applicantId !== applicantId) throw new ForbiddenException('Not your resume');
        return resume;
    }

    /** A replaced resume is deleted completely unless an approved match still uses it; then it only stays superseded. */
    private async removeReplaced(resume: Resume): Promise<void> {
        try {
            const outcome = await this.removal.removeIfUnused(resume);
            if (outcome === 'in_use') this.logger.log(`Replaced resume ${resume.id} is used by an approved match; keeping its files`);
        } catch (err) {
            // confirm already succeeded; the daily cleanup job retries superseded resumes
            this.logger.warn(`Could not remove replaced resume ${resume.id}: ${(err as Error).message}`);
        }
    }

    /**
     * DELETE /resumes/:id (contract 5.4): 409 when an approved match uses the resume, otherwise it is removed completely
     * (Cloudinary original + PDF, embedding, DB row). resume.deleted is published only if it was the active resume.
     */
    async deleteOwn(resumeId: string, applicantId: string) {
        const resume = await this.findOwned(resumeId, applicantId);
        const wasActive = resume.status === 'parsed' && !!resume.confirmedAt && !resume.supersededAt;

        let outcome: RemoveOutcome;
        try {
            outcome = await this.removal.removeIfUnused(resume);
        } catch (err) {
            this.logger.error(`Could not delete resume ${resume.id}: ${(err as Error).message}`);
            throw new ServiceUnavailableException('Could not delete the resume right now. Please try again in a moment.');
        }

        if (outcome === 'in_use') {
            throw new ConflictException('A company you shared this resume with is using it, so it cannot be deleted right now.');
        }
        if (outcome === 'files_failed') {
            throw new ServiceUnavailableException('Could not delete the resume file. Please try again in a moment.');
        }
        if (wasActive) await this.removal.publishDeleted(resume);
        return { deleted: true };
    }

    async updateOwn(resumeId: string, applicantId: string, dto: UpdateResumeDto) {
        const resume = await this.findOwned(resumeId, applicantId);
        if (resume.supersededAt) throw new ConflictException('This resume has been replaced by a newer one and can no longer be edited');

        // target role fields are columns, not parsed data: keep them out of parsedData
        const { targetTrack, targetStack, ...rest } = dto;
        const parsedChanges = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
        const hasParsedChanges = Object.keys(parsedChanges).length > 0;
        const mergedData = { ...((resume.parsedData as Record<string, any>) || {}), ...parsedChanges };

        const targetChange = await this.resolveTargetChange(resume, targetTrack, targetStack);
        const updated = await this.prisma.resume.update({
            where: { id: resumeId },
            data: {
                ...targetChange,
                ...(hasParsedChanges ? { parsedData: mergedData as Prisma.InputJsonValue } : {}),
            },
        });

        // Only a CONFIRMED resume is matched, so only then does an edit need a re-match (contract 5.4).
        if (hasParsedChanges && resume.status === 'parsed' && resume.confirmedAt) {
            await this.publishBestEffort('resume.updated', {
                ...mergedData,
                resumeId: resume.id,
                applicantId,
                requestId: randomUUID(),
            });
        }

        return this.withLabel(updated);
    }

    /** Target role can change only while unconfirmed; returns the columns to update ({} = no change). */
    private async resolveTargetChange(resume: Resume, track?: string, stack?: string) {
        const nextTrack = track ?? resume.targetTrack;
        const nextStack = stack ?? resume.targetStack;
        if (nextTrack === resume.targetTrack && nextStack === resume.targetStack) return {};

        if (resume.confirmedAt) {
            throw new ConflictException('The target role cannot be changed after the resume is confirmed. Upload a new resume for another role instead.');
        }
        if (!isValidTarget(nextTrack, nextStack)) {
            throw new BadRequestException(`Stack "${nextStack}" does not belong to track "${nextTrack}"`);
        }
        const targetKey = buildTargetKey(nextTrack, nextStack);
        const clash = await this.prisma.resume.findFirst({
            where: { applicantId: resume.applicantId, targetKey, confirmedAt: null, supersededAt: null, id: { not: resume.id } },
        });
        if (clash) {
            throw new ConflictException('You already have an unconfirmed upload for this target role. Confirm or delete it first.');
        }
        return { targetTrack: nextTrack, targetStack: nextStack, targetKey };
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