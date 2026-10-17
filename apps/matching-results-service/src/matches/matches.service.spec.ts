import { MatchesService } from './matches.service';

// unit test: the real Prisma client and Redis stay out of it, everything is mocked below
jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('../redis/redis.service', () => ({ RedisService: class {} }));
jest.mock('../generated/prisma', () => ({ Prisma: { sql: (...a: unknown[]) => a, join: (...a: unknown[]) => a } }));

describe('MatchesService', () => {
    let prisma: any;
    let redis: any;
    let service: MatchesService;

    beforeEach(() => {
        prisma = {
            match: { upsert: jest.fn().mockResolvedValue({ id: 'm1' }), findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
            roleScan: { upsert: jest.fn().mockImplementation((args) => args) },
            $transaction: jest.fn().mockResolvedValue([]),
            $queryRaw: jest.fn(),
        };
        redis = { client: { xadd: jest.fn().mockResolvedValue('1-0') } };
        service = new MatchesService(prisma, redis);
    });

    describe('saveScans', () => {
        const scan = { jobRoleId: 'r1', applicantId: 'a1', resumeId: 'res1', eligible: true, score: 0.8, inputHash: 'h1' };

        it('upserts one RoleScan per (jobRoleId, resumeId) and stores the inputHash', async () => {
            await service.saveScans({ scans: [scan] });

            expect(prisma.roleScan.upsert).toHaveBeenCalledTimes(1);
            const args = prisma.roleScan.upsert.mock.calls[0][0];
            expect(args.where).toEqual({ jobRoleId_resumeId: { jobRoleId: 'r1', resumeId: 'res1' } });
            expect(args.create).toMatchObject({ applicantId: 'a1', eligible: true, score: 0.8, inputHash: 'h1' });
            expect(args.update).toMatchObject({ eligible: true, score: 0.8, inputHash: 'h1' });
            expect(prisma.$transaction).toHaveBeenCalledTimes(1);
        });

        it('keeps two resumes of the same applicant as two rows', async () => {
            await service.saveScans({ scans: [scan, { ...scan, resumeId: 'res2', eligible: false, score: 0.2, inputHash: 'h2' }] });

            const keys = prisma.roleScan.upsert.mock.calls.map((c: any[]) => c[0].where.jobRoleId_resumeId.resumeId);
            expect(keys).toEqual(['res1', 'res2']);
        });

        it('stores a null inputHash when the agent sends none', async () => {
            await service.saveScans({ scans: [{ ...scan, inputHash: undefined }] });

            expect(prisma.roleScan.upsert.mock.calls[0][0].create.inputHash).toBeNull();
        });

        it('ignores malformed entries (no resumeId, bad score) and does nothing when none are left', async () => {
            await service.saveScans({ scans: [{ ...scan, resumeId: undefined }, { ...scan, score: NaN }, null as any] });

            expect(prisma.$transaction).not.toHaveBeenCalled();
            expect(prisma.roleScan.upsert).not.toHaveBeenCalled();
        });
    });

    describe('saveMatchResult', () => {
        const computed = { applicantId: 'a1', jobRoleId: 'r1', score: 0.7, eligible: true };

        it('stores unverifiedRules from the event', async () => {
            await service.saveMatchResult({ ...computed, unverifiedRules: ['cgpa', 'branch'] });

            const args = prisma.match.upsert.mock.calls[0][0];
            expect(args.create.unverifiedRules).toEqual(['cgpa', 'branch']);
            expect(args.update.unverifiedRules).toEqual(['cgpa', 'branch']);
        });

        it('clears unverifiedRules on a re-score that does not send the field', async () => {
            await service.saveMatchResult(computed);

            expect(prisma.match.upsert.mock.calls[0][0].update.unverifiedRules).toEqual([]);
        });

        it('sends no e-mail and publishes nothing (notification-service owns that now)', async () => {
            await service.saveMatchResult(computed);
            await service.saveMatchResult({ ...computed, eligible: false });

            expect(prisma.match.upsert).toHaveBeenCalledTimes(2);
            expect(redis.client.xadd).not.toHaveBeenCalled();
        });
    });

    describe('saveFeedback', () => {
        it('saves the text without sending any e-mail', async () => {
            prisma.match.findUnique.mockResolvedValue({ id: 'm1', eligible: false, feedback: null, roleTitle: 'Dev' });

            await service.saveFeedback({ applicantId: 'a1', jobRoleId: 'r1', feedback: 'learn X' });

            expect(prisma.match.update).toHaveBeenCalledWith({ where: { id: 'm1' }, data: { feedback: 'learn X' } });
            expect(redis.client.xadd).not.toHaveBeenCalled();
        });
    });

    describe('onResumePdfReady', () => {
        it('publishes candidate.ready with applicantName and score, and nothing else', async () => {
            prisma.match.findUnique.mockResolvedValue({ id: 'm1', applicantId: 'a1', jobRoleId: 'r1', applicantStatus: 'approved', score: 0.91, roleTitle: 'Backend Dev' });
            prisma.match.updateMany.mockResolvedValue({ count: 1 });
            prisma.$queryRaw
                .mockResolvedValueOnce([{ jobRoleId: 'r1', title: 'Backend Developer', companyId: 'c1', companyName: 'Acme', industry: null, stopped: false }])
                .mockResolvedValueOnce([{ name: 'Asha Rao' }]);

            await service.onResumePdfReady({ matchId: 'm1', pdfPublicId: 'p', fileName: 'f.pdf' });

            expect(redis.client.xadd).toHaveBeenCalledTimes(1);
            const [stream, maxlen, approx, limit, id, field, json] = redis.client.xadd.mock.calls[0];
            expect(stream).toBe('candidate.ready');
            expect([maxlen, approx, limit, id, field]).toEqual(['MAXLEN', '~', 10000, '*', 'data']);
            expect(JSON.parse(json)).toEqual({
                companyId: 'c1', matchId: 'm1', jobRoleId: 'r1', roleTitle: 'Backend Developer', applicantName: 'Asha Rao', score: 0.91,
                requestId: expect.any(String),
            });
        });
    });

    describe('getForApplicant', () => {
        it('never exposes recruiter-side fields to the applicant', async () => {
            prisma.match = {
                ...prisma.match,
                findMany: jest.fn().mockResolvedValue([{
                    id: 'm1', applicantId: 'a1', jobRoleId: 'r1', roleTitle: 'Dev', eligible: true, score: 0.5,
                    decision: 'rejected', decidedAt: new Date(), decidedBy: 'c1', breakdown: { x: 1 },
                    rejectReason: 'not_enough_experience', rejectMessage: 'internal note', rejectionFeedback: 'work on X', unverifiedRules: ['cgpa'],
                }]),
            };
            prisma.$queryRaw.mockResolvedValue([{ jobRoleId: 'r1', title: 'Dev', companyId: 'c1', companyName: 'Acme', industry: null, stopped: false }]);

            const [m] = await service.getForApplicant('a1');

            for (const hidden of ['decision', 'decidedAt', 'decidedBy', 'breakdown', 'rejectReason', 'rejectMessage']) {
                expect(m).not.toHaveProperty(hidden);
            }
            expect(m).toMatchObject({ rejectionFeedback: 'work on X', unverifiedRules: ['cgpa'], companyName: 'Acme' });
        });
    });
});
