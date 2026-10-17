import { MatchesService } from './matches.service';

// unit test: the real Prisma client and Redis stay out of it, everything is mocked below
jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('../redis/redis.service', () => ({ RedisService: class {} }));
jest.mock('../generated/prisma', () => ({ Prisma: { sql: (...a: unknown[]) => a, join: (...a: unknown[]) => a, DbNull: 'DbNull' } }));

/** Prisma.sql is mocked as [strings, ...values]; this picks the answer by the table the query reads. */
const sqlText = (q: any) => (Array.isArray(q) && Array.isArray(q[0]) ? q[0].join('?') : String(q));

describe('MatchesService read APIs and feedback consumers (contract 5.6)', () => {
    let prisma: any;
    let service: MatchesService;

    const row = (over: Record<string, unknown> = {}) => ({
        id: 'm1', applicantId: 'a1', jobRoleId: 'r1', roleTitle: 'Backend Developer', resumeId: 'res1',
        score: 0.8, eligible: true, reason: null, matchedSkills: [], partialSkills: [], missingSkills: [],
        breakdown: { gatesFailed: ['cgpa'], secret: 1 }, modelVersion: 'v1', feedback: null,
        applicantStatus: 'approved', approvedAt: null, resumeStatus: 'ready', resumeSharedAt: null,
        decision: null, decidedAt: null, decidedBy: null,
        shortlistInfo: null, rejectReason: null, rejectMessage: null, prepGuide: null, rejectionFeedback: null,
        unverifiedRules: [], createdAt: new Date(), updatedAt: new Date(),
        ...over,
    });

    beforeEach(() => {
        prisma = {
            match: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn().mockResolvedValue({}) },
            $queryRaw: jest.fn().mockImplementation(async (q: any) => {
                const t = sqlText(q);
                if (t.includes('"Resume"')) return [{ id: 'res1', targetTrack: 'backend', targetStack: 'java' }];
                if (t.includes('"JobRole"')) return [{ jobRoleId: 'r1', title: 'Backend Developer', companyId: 'c1', companyName: 'Acme', industry: 'IT', stopped: false }];
                return [];
            }),
        };
        service = new MatchesService(prisma, { client: { xadd: jest.fn() } } as any);
    });

    describe('getForApplicant', () => {
        const FORBIDDEN = ['rejectReason', 'rejectMessage', 'decidedBy', 'decidedAt', 'decision', 'breakdown'];

        it('never exposes the recruiter reason, decidedBy or breakdown, even for a rejected match', async () => {
            prisma.match.findMany.mockResolvedValue([row({
                decision: 'rejected', decidedBy: 'c1', decidedAt: new Date(), rejectReason: 'skills_gap', rejectMessage: 'Thanks for applying',
                rejectionFeedback: 'Work on system design',
            })]);

            const [m] = await service.getForApplicant('a1');

            for (const key of FORBIDDEN) expect(m).not.toHaveProperty(key);
            expect(JSON.stringify(m)).not.toContain('skills_gap');
            expect(m).toMatchObject({ outcome: 'rejected', rejectionMessage: 'Thanks for applying', rejectionFeedback: 'Work on system design' });
        });

        it('shows the company details and the AI prep guide for a shortlisted match', async () => {
            const shortlistInfo = { roundName: 'Technical round 1', mode: 'online' };
            prisma.match.findMany.mockResolvedValue([row({ decision: 'shortlisted', shortlistInfo, prepGuide: 'Revise SQL' })]);

            const [m] = await service.getForApplicant('a1');

            expect(m).toMatchObject({ outcome: 'shortlisted', shortlistInfo, prepGuide: 'Revise SQL', rejectionMessage: null, rejectionFeedback: null });
            for (const key of FORBIDDEN) expect(m).not.toHaveProperty(key);
        });

        it('has outcome null and empty decision fields while the company has not decided', async () => {
            prisma.match.findMany.mockResolvedValue([row({ unverifiedRules: ['cgpa'] })]);

            const [m] = await service.getForApplicant('a1');

            expect(m).toMatchObject({
                outcome: null, shortlistInfo: null, prepGuide: null, rejectionMessage: null, rejectionFeedback: null,
                unverifiedRules: ['cgpa'], resumeId: 'res1', resumeTargetLabel: 'Backend · Java', companyName: 'Acme',
            });
        });

        it('hides stale AI text that belongs to the other outcome', async () => {
            prisma.match.findMany.mockResolvedValue([row({ decision: 'rejected', rejectMessage: 'sorry', prepGuide: 'old guide', shortlistInfo: { roundName: 'R1', mode: 'phone' } })]);

            const [m] = await service.getForApplicant('a1');

            expect(m.prepGuide).toBeNull();
            expect(m.shortlistInfo).toBeNull();
        });

        it('gives a null label when the resume is gone', async () => {
            prisma.match.findMany.mockResolvedValue([row({ resumeId: 'deleted-resume' })]);

            const [m] = await service.getForApplicant('a1');

            expect(m.resumeTargetLabel).toBeNull();
        });
    });

    describe('getForJobRole', () => {
        it('only asks for eligible, approved candidates and adds the resume label', async () => {
            prisma.match.findMany.mockResolvedValue([row({ decision: 'rejected', rejectReason: 'experience', rejectMessage: 'note', unverifiedRules: ['branch'] })]);

            const [m] = await service.getForJobRole('r1');

            expect(prisma.match.findMany.mock.calls[0][0].where).toEqual({ jobRoleId: 'r1', eligible: true, applicantStatus: 'approved' });
            expect(m).toMatchObject({ decision: 'rejected', rejectReason: 'experience', rejectMessage: 'note', unverifiedRules: ['branch'], resumeTargetLabel: 'Backend · Java' });
        });
    });

    describe('savePrepGuide (prep.ready)', () => {
        it('stores the guide on a shortlisted match', async () => {
            prisma.match.findUnique.mockResolvedValue(row({ decision: 'shortlisted' }));

            await service.savePrepGuide({ matchId: 'm1', applicantId: 'a1', jobRoleId: 'r1', guide: 'Revise SQL' });

            expect(prisma.match.findUnique).toHaveBeenCalledWith({ where: { id: 'm1' } });
            expect(prisma.match.update).toHaveBeenCalledWith({ where: { id: 'm1' }, data: { prepGuide: 'Revise SQL' } });
        });

        it('throws when the match row is missing so the consumer retries', async () => {
            prisma.match.findUnique.mockResolvedValue(null);

            await expect(service.savePrepGuide({ matchId: 'm1', guide: 'x' })).rejects.toThrow(/not found/);
            expect(prisma.match.update).not.toHaveBeenCalled();
        });

        it('falls back to applicantId + jobRoleId when matchId is absent', async () => {
            prisma.match.findUnique.mockResolvedValue(row({ decision: 'shortlisted' }));

            await service.savePrepGuide({ applicantId: 'a1', jobRoleId: 'r1', guide: 'g' });

            expect(prisma.match.findUnique).toHaveBeenCalledWith({ where: { applicantId_jobRoleId: { applicantId: 'a1', jobRoleId: 'r1' } } });
            expect(prisma.match.update).toHaveBeenCalled();
        });

        it('drops a stale guide when the candidate is no longer shortlisted', async () => {
            prisma.match.findUnique.mockResolvedValue(row({ decision: 'rejected' }));

            await service.savePrepGuide({ matchId: 'm1', guide: 'x' });

            expect(prisma.match.update).not.toHaveBeenCalled();
        });

        it('is idempotent and ignores an empty guide', async () => {
            prisma.match.findUnique.mockResolvedValue(row({ decision: 'shortlisted', prepGuide: 'same' }));

            await service.savePrepGuide({ matchId: 'm1', guide: 'same' });
            await service.savePrepGuide({ matchId: 'm1', guide: '  ' });

            expect(prisma.match.update).not.toHaveBeenCalled();
        });
    });

    describe('saveRejectionFeedback (rejection-feedback.ready)', () => {
        it('stores the feedback on a rejected match', async () => {
            prisma.match.findUnique.mockResolvedValue(row({ decision: 'rejected' }));

            await service.saveRejectionFeedback({ matchId: 'm1', feedback: 'Add projects' });

            expect(prisma.match.update).toHaveBeenCalledWith({ where: { id: 'm1' }, data: { rejectionFeedback: 'Add projects' } });
        });

        it('stores nothing when feedback is null (position_filled / other)', async () => {
            prisma.match.findUnique.mockResolvedValue(row({ decision: 'rejected' }));

            await service.saveRejectionFeedback({ matchId: 'm1', feedback: null });

            expect(prisma.match.update).not.toHaveBeenCalled();
        });

        it('throws when the match row is missing so the consumer retries', async () => {
            prisma.match.findUnique.mockResolvedValue(null);

            await expect(service.saveRejectionFeedback({ matchId: 'm1', feedback: 'x' })).rejects.toThrow(/not found/);
        });

        it('drops stale feedback when the decision was cleared or changed', async () => {
            prisma.match.findUnique.mockResolvedValue(row({ decision: null }));

            await service.saveRejectionFeedback({ matchId: 'm1', feedback: 'x' });

            expect(prisma.match.update).not.toHaveBeenCalled();
        });
    });
});
