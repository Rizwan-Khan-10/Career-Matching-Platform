import { ResumeCleanupService } from './resume-cleanup.service';
import { ResumeRemovalService } from './resume-removal.service';

const row = (id: string) => ({ id, applicantId: 'app-1', cloudinaryPublicId: `resumes/app-1/${id}.pdf`, pdfPublicId: null });
const NOW = new Date('2026-10-17T00:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

function setup() {
    const prisma = {
        $queryRaw: jest.fn().mockResolvedValue([]),
        $executeRaw: jest.fn().mockResolvedValue(1),
        resume: { findMany: jest.fn().mockResolvedValue([]), delete: jest.fn().mockResolvedValue({}) },
    };
    const redis = {
        client: {
            set: jest.fn().mockResolvedValue('OK'),
            get: jest.fn(),
            del: jest.fn().mockResolvedValue(1),
            xadd: jest.fn().mockResolvedValue('1-0'),
        },
    };
    const storage = { destroyResumeFiles: jest.fn().mockResolvedValue(true) };
    // real removal routine on mocked Prisma / Redis / Cloudinary, so the tests cover the whole path
    const removal = new ResumeRemovalService(prisma as any, redis as any, storage as any);
    const service = new ResumeCleanupService(prisma as any, redis as any, removal);
    return { prisma, redis, storage, removal, service };
}

/** $queryRaw is used twice per superseded resume: first the job's SELECT, then the approved-match re-check */
function supersededRows(prisma: { $queryRaw: jest.Mock }, rows: ReturnType<typeof row>[], inUse = false) {
    prisma.$queryRaw.mockResolvedValueOnce(rows);
    for (let i = 0; i < rows.length; i++) prisma.$queryRaw.mockResolvedValueOnce(inUse ? [{ ok: 1 }] : []);
}

describe('ResumeCleanupService (a): superseded resumes', () => {
    it('selects only superseded resumes that no approved match references', async () => {
        const { service, prisma } = setup();
        await service.runOnce(NOW);
        const sql = prisma.$queryRaw.mock.calls[0][0].join('?');
        expect(sql).toContain('"supersededAt" IS NOT NULL');
        expect(sql).toContain('NOT EXISTS');
        expect(sql).toContain('"applicantStatus" = \'approved\'');
    });

    it('removes them (original, PDF, row) and publishes resume.deleted', async () => {
        const { service, prisma, storage, redis } = setup();
        supersededRows(prisma, [row('s1'), row('s2')]);
        const report = await service.runOnce(NOW);

        expect(report.supersededRemoved).toBe(2);
        expect(storage.destroyResumeFiles).toHaveBeenCalledTimes(2);
        expect(prisma.resume.delete.mock.calls.map((c) => c[0].where.id)).toEqual(['s1', 's2']);
        const streams = redis.client.xadd.mock.calls.map((c) => c[0]);
        expect(streams).toEqual(['resume.deleted', 'resume.deleted']);
        expect(JSON.parse(redis.client.xadd.mock.calls[0][6])).toMatchObject({ resumeId: 's1', applicantId: 'app-1' });
    });

    it('leaves a resume alone when an approved match started using it after it was selected', async () => {
        const { service, prisma, storage, redis } = setup();
        supersededRows(prisma, [row('s1')], true);
        const report = await service.runOnce(NOW);

        expect(report).toMatchObject({ supersededRemoved: 0, skipped: 1, failed: 0 });
        expect(storage.destroyResumeFiles).not.toHaveBeenCalled();
        expect(prisma.resume.delete).not.toHaveBeenCalled();
        expect(redis.client.xadd).not.toHaveBeenCalled();
    });

    it('keeps the row and publishes nothing when Cloudinary fails, and goes on with the next one', async () => {
        const { service, prisma, storage, redis } = setup();
        supersededRows(prisma, [row('s1'), row('s2')]);
        storage.destroyResumeFiles.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
        const report = await service.runOnce(NOW);

        expect(report).toMatchObject({ supersededRemoved: 1, failed: 1 });
        expect(prisma.resume.delete.mock.calls.map((c) => c[0].where.id)).toEqual(['s2']);
        expect(redis.client.xadd).toHaveBeenCalledTimes(1);
    });
});

describe('ResumeCleanupService (b): unconfirmed uploads and the TTL', () => {
    const saved = { ...process.env };
    afterEach(() => {
        process.env = { ...saved };
    });

    it('looks for unconfirmed, non-superseded uploads older than 14 days by default', async () => {
        delete process.env.UNCONFIRMED_RESUME_TTL_DAYS;
        const { service, prisma } = setup();
        await service.runOnce(NOW);

        const args = prisma.resume.findMany.mock.calls[0][0];
        expect(args.where.confirmedAt).toBeNull();
        expect(args.where.supersededAt).toBeNull();
        expect(args.where.createdAt.lt).toEqual(new Date(NOW.getTime() - 14 * DAY));
        expect(args.orderBy).toEqual({ createdAt: 'asc' });
        expect(args.take).toBe(100);
    });

    it('uses UNCONFIRMED_RESUME_TTL_DAYS', async () => {
        process.env.UNCONFIRMED_RESUME_TTL_DAYS = '3';
        const { service, prisma } = setup();
        await service.runOnce(NOW);
        expect(prisma.resume.findMany.mock.calls[0][0].where.createdAt.lt).toEqual(new Date(NOW.getTime() - 3 * DAY));
    });

    it('removes stale uploads completely but publishes no resume.deleted (they were never active)', async () => {
        const { service, prisma, storage, redis } = setup();
        prisma.resume.findMany.mockResolvedValue([row('u1')]);
        const report = await service.runOnce(NOW);

        expect(report.unconfirmedRemoved).toBe(1);
        expect(storage.destroyResumeFiles).toHaveBeenCalledWith('resumes/app-1/u1.pdf', null);
        expect(prisma.resume.delete).toHaveBeenCalledWith({ where: { id: 'u1' } });
        expect(redis.client.xadd).not.toHaveBeenCalled();
    });

    it('still cleans unconfirmed uploads when the superseded query fails (e.g. matches schema missing)', async () => {
        const { service, prisma } = setup();
        prisma.$queryRaw.mockRejectedValueOnce(new Error('schema "matches_service" does not exist'));
        prisma.resume.findMany.mockResolvedValue([row('u1')]);
        const report = await service.runOnce(NOW);
        expect(report.unconfirmedRemoved).toBe(1);
    });
});

describe('ResumeCleanupService scheduling', () => {
    it('does nothing when another instance holds the lock', async () => {
        const { service, redis } = setup();
        redis.client.set.mockResolvedValue(null);
        const runOnce = jest.spyOn(service, 'runOnce');
        await expect(service.runScheduled()).resolves.toBeNull();
        expect(runOnce).not.toHaveBeenCalled();
        expect(redis.client.set.mock.calls[0].slice(2)).toEqual(['EX', 3600, 'NX']);
    });

    it('skips the run (does not throw) when Redis is unreachable', async () => {
        const { service, redis } = setup();
        redis.client.set.mockRejectedValue(new Error('redis down'));
        await expect(service.runScheduled()).resolves.toBeNull();
    });

    it('runs once and releases its own lock', async () => {
        const { service, redis } = setup();
        redis.client.get.mockImplementation(() => Promise.resolve(redis.client.set.mock.calls[0][1]));
        const report = await service.runScheduled();
        expect(report).toMatchObject({ supersededRemoved: 0, unconfirmedRemoved: 0 });
        expect(redis.client.del).toHaveBeenCalledTimes(1);
    });

    it('does not release a lock that belongs to someone else', async () => {
        const { service, redis } = setup();
        redis.client.get.mockResolvedValue('another-token');
        await service.runScheduled();
        expect(redis.client.del).not.toHaveBeenCalled();
    });

    it('starts no timer when CLEANUP_ENABLED=false', () => {
        const saved = process.env.CLEANUP_ENABLED;
        process.env.CLEANUP_ENABLED = 'false';
        const spy = jest.spyOn(global, 'setTimeout');
        const before = spy.mock.calls.length;
        const { service } = setup();
        service.onModuleInit();
        expect(spy.mock.calls.length).toBe(before);
        spy.mockRestore();
        process.env.CLEANUP_ENABLED = saved;
        if (saved === undefined) delete process.env.CLEANUP_ENABLED;
    });

    it('starts an unref-ed timer by default and clears it on shutdown', () => {
        jest.useFakeTimers();
        try {
            const { service, redis } = setup();
            service.onModuleInit();
            jest.advanceTimersByTime(59_000);
            expect(redis.client.set).not.toHaveBeenCalled();
            jest.advanceTimersByTime(2_000);
            expect(redis.client.set).toHaveBeenCalledTimes(1);
            service.onModuleDestroy();
        } finally {
            jest.useRealTimers();
        }
    });
});