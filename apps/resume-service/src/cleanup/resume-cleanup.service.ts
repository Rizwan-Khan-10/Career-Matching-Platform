import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { readCleanupConfig } from './cleanup.config';
import { RemovableResume, ResumeRemovalService } from './resume-removal.service';

const LOCK_KEY = 'resume-service:cleanup-lock';
const LOCK_TTL_SECONDS = 60 * 60;
const STARTUP_DELAY_MS = 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface CleanupReport {
    supersededRemoved: number;
    unconfirmedRemoved: number;
    skipped: number; // an approved match started using the resume after it was selected
    failed: number; // Cloudinary or DB failure; the row stays and is retried on the next run
}

type Kind = 'superseded' | 'unconfirmed';

/**
 * Daily storage cleanup (spec 9.11):
 *  (a) superseded resumes that no approved match references any more -> removed, resume.deleted published
 *  (b) uploads that were never confirmed (pending / failed / parsed) older than UNCONFIRMED_RESUME_TTL_DAYS -> removed
 */
@Injectable()
export class ResumeCleanupService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(ResumeCleanupService.name);
    private startTimer?: ReturnType<typeof setTimeout>;
    private intervalTimer?: ReturnType<typeof setInterval>;

    constructor(
        private prisma: PrismaService,
        private redis: RedisService,
        private removal: ResumeRemovalService,
    ) { }

    onModuleInit() {
        const config = readCleanupConfig();
        if (!config.enabled) {
            this.logger.log('Storage cleanup job is disabled (CLEANUP_ENABLED=false)');
            return;
        }
        // first run shortly after boot, then every CLEANUP_INTERVAL_HOURS (default 24); every run is idempotent
        this.startTimer = setTimeout(() => {
            void this.runScheduled();
            this.intervalTimer = setInterval(() => void this.runScheduled(), config.intervalMs);
            this.intervalTimer.unref();
        }, STARTUP_DELAY_MS);
        this.startTimer.unref();
    }

    onModuleDestroy() {
        if (this.startTimer) clearTimeout(this.startTimer);
        if (this.intervalTimer) clearInterval(this.intervalTimer);
    }

    /** Timer entry: a Redis lock keeps several instances from cleaning at the same time. Never throws. */
    async runScheduled(): Promise<CleanupReport | null> {
        const token = randomUUID();
        try {
            const got = await this.redis.client.set(LOCK_KEY, token, 'EX', LOCK_TTL_SECONDS, 'NX');
            if (got !== 'OK') {
                this.logger.log('Cleanup is already running on another instance; skipping');
                return null;
            }
        } catch (err) {
            this.logger.warn(`Could not take the cleanup lock, skipping this run: ${(err as Error).message}`);
            return null;
        }
        try {
            return await this.runOnce();
        } catch (err) {
            this.logger.error(`Cleanup run failed: ${(err as Error).message}`);
            return null;
        } finally {
            await this.releaseLock(token);
        }
    }

    async runOnce(now: Date = new Date()): Promise<CleanupReport> {
        const config = readCleanupConfig();
        const report: CleanupReport = { supersededRemoved: 0, unconfirmedRemoved: 0, skipped: 0, failed: 0 };

        // one category failing (e.g. matches table missing) must not block the other
        await this.safely('superseded', async () => {
            for (const resume of await this.findUnreferencedSuperseded(config.batchSize)) {
                await this.handle(resume, 'superseded', report);
            }
        });
        await this.safely('unconfirmed', async () => {
            for (const resume of await this.findStaleUnconfirmed(now, config)) {
                await this.handle(resume, 'unconfirmed', report);
            }
        });

        this.logger.log(`Cleanup done: ${JSON.stringify(report)}`);
        return report;
    }

    private findUnreferencedSuperseded(batchSize: number): Promise<RemovableResume[]> {
        return this.prisma.$queryRaw<RemovableResume[]>`
            SELECT r.id, r."applicantId", r."cloudinaryPublicId", r."pdfPublicId"
            FROM "resumes_service"."Resume" r
            WHERE r."supersededAt" IS NOT NULL
              AND NOT EXISTS (
                SELECT 1 FROM "matches_service"."Match" m
                WHERE m."resumeId" = r.id AND m."applicantStatus" = 'approved')
            ORDER BY r."supersededAt" ASC
            LIMIT ${batchSize}`;
    }

    private findStaleUnconfirmed(now: Date, config: { unconfirmedTtlDays: number; batchSize: number }): Promise<RemovableResume[]> {
        const cutoff = new Date(now.getTime() - config.unconfirmedTtlDays * DAY_MS);
        return this.prisma.resume.findMany({
            where: { confirmedAt: null, supersededAt: null, createdAt: { lt: cutoff } },
            orderBy: { createdAt: 'asc' },
            take: config.batchSize,
            select: { id: true, applicantId: true, cloudinaryPublicId: true, pdfPublicId: true },
        });
    }

    private async handle(resume: RemovableResume, kind: Kind, report: CleanupReport): Promise<void> {
        try {
            const outcome = await this.removal.removeIfUnused(resume);
            if (outcome === 'in_use') report.skipped++;
            else if (outcome === 'files_failed') report.failed++;
            else if (kind === 'superseded') {
                report.supersededRemoved++;
                await this.removal.publishDeleted(resume);
            } else {
                report.unconfirmedRemoved++; // never active: no match or event refers to it
            }
        } catch (err) {
            report.failed++;
            this.logger.warn(`Could not clean up resume ${resume.id}: ${(err as Error).message}`);
        }
    }

    private async safely(label: string, work: () => Promise<void>): Promise<void> {
        try {
            await work();
        } catch (err) {
            this.logger.error(`Cleanup of ${label} resumes failed: ${(err as Error).message}`);
        }
    }

    private async releaseLock(token: string): Promise<void> {
        try {
            if ((await this.redis.client.get(LOCK_KEY)) === token) await this.redis.client.del(LOCK_KEY);
        } catch {
            // the lock expires by itself after an hour
        }
    }
}