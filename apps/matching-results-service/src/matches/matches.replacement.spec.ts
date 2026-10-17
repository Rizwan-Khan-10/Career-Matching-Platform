import { MatchesService } from './matches.service';

// unit test: the real Prisma client and Redis stay out of it, everything is mocked below
jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('../redis/redis.service', () => ({ RedisService: class {} }));
jest.mock('../generated/prisma', () => ({ Prisma: { sql: (...a: unknown[]) => a, join: (...a: unknown[]) => a } }));

/** Replacement rule (contract §5.6) and cleanup on resume.superseded / resume.deleted (task 3.2). */
describe('MatchesService - replacement rule and resume cleanup', () => {
    let prisma: any;
    let service: MatchesService;

    const incoming = { applicantId: 'a1', jobRoleId: 'r1', resumeId: 'new-resume', score: 0.6, eligible: true };
    const existingRow = (over: Record<string, unknown> = {}) => ({ id: 'm1', resumeId: 'old-resume', score: 0.8, applicantStatus: 'pending', ...over });
    const resumeIsActive = () => prisma.$queryRaw.mockResolvedValue([{ ok: true }]);
    const resumeIsGone = () => prisma.$queryRaw.mockResolvedValue([]);

    beforeEach(() => {
        prisma = {
            match: { findUnique: jest.fn(), upsert: jest.fn().mockResolvedValue({ id: 'saved' }), deleteMany: jest.fn().mockImplementation((a) => a) },
            roleScan: { deleteMany: jest.fn().mockImplementation((a) => a) },
            $transaction: jest.fn().mockResolvedValue([]),
            $queryRaw: jest.fn().mockResolvedValue([]),
        };
        service = new MatchesService(prisma, { client: { xadd: jest.fn() } } as any);
    });

    describe('saveMatchResult', () => {
        it('creates the row when there is no existing match', async () => {
            prisma.match.findUnique.mockResolvedValue(null);

            await service.saveMatchResult(incoming);

            expect(prisma.match.upsert).toHaveBeenCalledTimes(1);
            expect(prisma.$queryRaw).not.toHaveBeenCalled();
        });

        it('replaces the existing row when the new resume scores better', async () => {
            prisma.match.findUnique.mockResolvedValue(existingRow({ score: 0.5 }));

            await service.saveMatchResult(incoming);

            expect(prisma.match.upsert).toHaveBeenCalledTimes(1);
            expect(prisma.match.upsert.mock.calls[0][0].update).toMatchObject({ resumeId: 'new-resume', score: 0.6 });
            expect(prisma.$queryRaw).not.toHaveBeenCalled(); // decided by the score alone
        });

        it('keeps the existing row when the new resume is not better and the old one is still active', async () => {
            prisma.match.findUnique.mockResolvedValue(existingRow({ score: 0.8 }));
            resumeIsActive();

            await service.saveMatchResult(incoming);

            expect(prisma.match.upsert).not.toHaveBeenCalled();
        });

        it('keeps the existing row on an equal score (needs a strictly better one)', async () => {
            prisma.match.findUnique.mockResolvedValue(existingRow({ score: 0.6 }));
            resumeIsActive();

            await service.saveMatchResult(incoming);

            expect(prisma.match.upsert).not.toHaveBeenCalled();
        });

        it('replaces a worse-scoring result when the existing resume is no longer active (deleted / superseded)', async () => {
            prisma.match.findUnique.mockResolvedValue(existingRow({ score: 0.9 }));
            resumeIsGone();

            await service.saveMatchResult(incoming);

            expect(prisma.match.upsert).toHaveBeenCalledTimes(1);
            expect(prisma.match.upsert.mock.calls[0][0].update).toMatchObject({ resumeId: 'new-resume' });
        });

        it('replaces when the existing row has no resume at all (old data)', async () => {
            prisma.match.findUnique.mockResolvedValue(existingRow({ resumeId: null, score: 0.9 }));

            await service.saveMatchResult(incoming);

            expect(prisma.match.upsert).toHaveBeenCalledTimes(1);
        });

        it('always refreshes the same resume, even with a lower score', async () => {
            prisma.match.findUnique.mockResolvedValue(existingRow({ resumeId: 'new-resume', score: 0.9 }));

            await service.saveMatchResult(incoming);

            expect(prisma.match.upsert).toHaveBeenCalledTimes(1);
            expect(prisma.match.upsert.mock.calls[0][0].update.score).toBe(0.6);
        });

        it('approved match is frozen: a different resume is ignored even with a much better score', async () => {
            prisma.match.findUnique.mockResolvedValue(existingRow({ applicantStatus: 'approved', score: 0.3 }));

            await service.saveMatchResult({ ...incoming, score: 0.99 });

            expect(prisma.match.upsert).not.toHaveBeenCalled();
        });

        it('approved match is frozen even when its resume is gone', async () => {
            prisma.match.findUnique.mockResolvedValue(existingRow({ applicantStatus: 'approved' }));
            resumeIsGone();

            await service.saveMatchResult(incoming);

            expect(prisma.match.upsert).not.toHaveBeenCalled();
        });

        it('approved match is refreshed for the SAME resume without touching the consent status', async () => {
            prisma.match.findUnique.mockResolvedValue(existingRow({ applicantStatus: 'approved', resumeId: 'new-resume' }));

            await service.saveMatchResult(incoming);

            expect(prisma.match.upsert).toHaveBeenCalledTimes(1);
            expect(prisma.match.upsert.mock.calls[0][0].update).not.toHaveProperty('applicantStatus');
        });
    });

    describe('onResumeRemoved (resume.superseded / resume.deleted)', () => {
        it('deletes the non-approved matches and ALL scan rows of that resume in one transaction', async () => {
            await service.onResumeRemoved({ resumeId: 'res1', applicantId: 'a1' });

            expect(prisma.$transaction).toHaveBeenCalledTimes(1);
            expect(prisma.match.deleteMany).toHaveBeenCalledWith({ where: { resumeId: 'res1', applicantStatus: { not: 'approved' } } });
            expect(prisma.roleScan.deleteMany).toHaveBeenCalledWith({ where: { resumeId: 'res1' } });
        });

        it('does nothing for a malformed event', async () => {
            await service.onResumeRemoved({ applicantId: 'a1' });
            await service.onResumeRemoved(undefined as any);

            expect(prisma.$transaction).not.toHaveBeenCalled();
        });
    });
});
