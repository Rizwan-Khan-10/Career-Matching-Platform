import { ConflictException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { JobsService } from './jobs.service';

// the generated Prisma client is not needed here (and cannot load outside the real app): mock what jobs.service imports
jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('../redis/redis.service', () => ({ RedisService: class {} }));
jest.mock('../storage/storage.service', () => ({ StorageService: class {} }));
jest.mock('../generated/prisma', () => ({ Prisma: {} }));

const FILE = { originalname: 'jd.pdf', size: 1234, buffer: Buffer.from('x') } as Express.Multer.File;

function setup(over: Record<string, unknown> = {}, approvalRequired: boolean | Error = false) {
    // the posting row, kept in memory so compare-and-set updates behave like the database
    const row: Record<string, any> = {
        id: 'p1', companyId: 'c1', fileUrl: 'https://files/jd.pdf', status: 'pending', approvalStatus: 'pending', approvalNote: null,
        stoppedAt: null, roles: [], ...over,
    };
    const prisma = {
        jobPosting: {
            create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'p1', ...data })),
            findUnique: jest.fn().mockImplementation(async () => (row.missing ? null : { ...row })),
            findMany: jest.fn().mockResolvedValue([]),
            updateMany: jest.fn().mockImplementation(async ({ where, data }) => {
                if (where.approvalStatus !== undefined && row.approvalStatus !== where.approvalStatus) return { count: 0 };
                Object.assign(row, data);
                return { count: 1 };
            }),
        },
        jobRole: {
            create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'r-new', ...data })),
            findUnique: jest.fn().mockResolvedValue({ id: 'r1', jobPostingId: 'p1', title: 'Old', requirements: {} }),
            update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'r1', ...data })),
            delete: jest.fn().mockResolvedValue({}),
        },
    };
    const pipeline: any = { xadd: jest.fn().mockReturnThis(), exec: jest.fn() };
    pipeline.exec.mockImplementation(async () => pipeline.xadd.mock.calls.map(() => [null, '1-0']));
    const redis = { client: { xadd: jest.fn().mockResolvedValue('1-0'), multi: jest.fn(() => pipeline) } };
    const storage = { uploadJobDoc: jest.fn().mockResolvedValue('https://files/new.pdf') };
    const settings = {
        jobApprovalRequired: jest.fn().mockImplementation(async () => {
            if (approvalRequired instanceof Error) throw approvalRequired;
            return approvalRequired;
        }),
    };
    const service = new JobsService(prisma as any, redis as any, storage as any, settings as any);
    const single = () => redis.client.xadd.mock.calls.map((c: any[]) => ({ stream: c[0], data: JSON.parse(c[6]), head: c.slice(1, 6) }));
    const atomic = () => pipeline.xadd.mock.calls.map((c: any[]) => ({ stream: c[0], data: JSON.parse(c[6]), head: c.slice(1, 6) }));
    return { service, prisma, redis, pipeline, storage, settings, row, single, atomic };
}

describe('JobsService upload and the posting approval (contract 5.5)', () => {
    describe('upload', () => {
        it('approval off: the posting is approved and jd.uploaded is published (trimmed, with a requestId)', async () => {
            const { service, prisma, single } = setup({}, false);

            const posting = await service.upload('c1', FILE);

            expect(prisma.jobPosting.create).toHaveBeenCalledWith({ data: { companyId: 'c1', fileUrl: 'https://files/new.pdf', status: 'pending', approvalStatus: 'approved' } });
            expect(posting.approvalStatus).toBe('approved');
            expect(single()).toEqual([{
                stream: 'jd.uploaded', head: ['MAXLEN', '~', 10000, '*', 'data'],
                data: { jobPostingId: 'p1', companyId: 'c1', fileUrl: 'https://files/new.pdf', requestId: expect.any(String) },
            }]);
        });

        it('approval on: the posting waits as pending and jd.uploaded is NOT published', async () => {
            const { service, prisma, single, atomic } = setup({}, true);

            const posting = await service.upload('c1', FILE);

            expect(prisma.jobPosting.create.mock.calls[0][0].data.approvalStatus).toBe('pending');
            expect(posting.approvalStatus).toBe('pending');
            expect(single()).toEqual([]);
            expect(atomic()).toEqual([]);
        });

        it('asks for the setting before the file is stored; when it cannot be read nothing is stored (503)', async () => {
            const { service, prisma, storage, single } = setup({}, new ServiceUnavailableException('down'));

            await expect(service.upload('c1', FILE)).rejects.toBeInstanceOf(ServiceUnavailableException);

            expect(storage.uploadJobDoc).not.toHaveBeenCalled();
            expect(prisma.jobPosting.create).not.toHaveBeenCalled();
            expect(single()).toEqual([]);
        });

        it('still validates the file first', async () => {
            const { service, settings } = setup();

            await expect(service.upload('c1', { originalname: 'a.exe', size: 5 } as Express.Multer.File)).rejects.toThrow(/Unsupported file type/);
            expect(settings.jobApprovalRequired).not.toHaveBeenCalled();
        });
    });

    describe('GET /jobs/mine', () => {
        it('returns the postings of the company with their approvalStatus and note', async () => {
            const { service, prisma } = setup();
            prisma.jobPosting.findMany.mockResolvedValue([{ id: 'p1', approvalStatus: 'rejected', approvalNote: 'Please add salary', roles: [] }]);

            const mine = await service.getByCompany('c1');

            expect(prisma.jobPosting.findMany).toHaveBeenCalledWith({ where: { companyId: 'c1' }, include: { roles: true }, orderBy: { createdAt: 'desc' } });
            expect(mine[0]).toMatchObject({ approvalStatus: 'rejected', approvalNote: 'Please add salary' });
        });
    });

    describe('listPending', () => {
        it('lists only pending postings, oldest first, with their roles', async () => {
            const { service, prisma } = setup();

            await service.listPending();

            expect(prisma.jobPosting.findMany).toHaveBeenCalledWith({ where: { approvalStatus: 'pending' }, include: { roles: true }, orderBy: { createdAt: 'asc' } });
        });
    });

    describe('decideApproval: approve', () => {
        it('releases a posting that was never scanned: jd.uploaded + job.approval.changed in ONE transaction', async () => {
            const { service, prisma, redis, atomic, single, row } = setup();

            const result: any = await service.decideApproval('p1', { approved: true });

            expect(prisma.jobPosting.updateMany).toHaveBeenCalledWith({ where: { id: 'p1', approvalStatus: 'pending' }, data: { approvalStatus: 'approved', approvalNote: null } });
            expect(redis.client.multi).toHaveBeenCalledTimes(1);
            expect(atomic().map((e: any) => e.stream)).toEqual(['jd.uploaded', 'job.approval.changed']);
            expect(atomic()[0].data).toMatchObject({ jobPostingId: 'p1', companyId: 'c1', fileUrl: 'https://files/jd.pdf' });
            expect(atomic()[1].data).toEqual({ companyId: 'c1', jobPostingId: 'p1', status: 'approved', requestId: expect.any(String) });
            expect(atomic().every((e: any) => e.head.join() === 'MAXLEN,~,10000,*,data')).toBe(true);
            expect(single()).toEqual([]);
            expect(row.approvalStatus).toBe('approved');
            expect(result.approvalStatus).toBe('approved');
        });

        it('also asks matching to score the roles that already exist (created by hand while it was pending)', async () => {
            const { service, atomic } = setup({ roles: [{ id: 'r1' }, { id: 'r2' }] });

            await service.decideApproval('p1', { approved: true });

            expect(atomic().map((e: any) => e.stream)).toEqual(['jd.uploaded', 'jd.extracted', 'job.approval.changed']);
            expect(atomic()[1].data).toMatchObject({ jobPostingId: 'p1', companyId: 'c1', roleIds: ['r1', 'r2'] });
        });

        it('does not scan again a posting that was already extracted: only jd.extracted', async () => {
            const { service, atomic } = setup({ status: 'extracted', roles: [{ id: 'r1' }] });

            await service.decideApproval('p1', { approved: true });

            expect(atomic().map((e: any) => e.stream)).toEqual(['jd.extracted', 'job.approval.changed']);
        });

        it('a stopped posting is approved but nothing is processed (reopen does that later)', async () => {
            const { service, atomic } = setup({ stoppedAt: new Date(), roles: [{ id: 'r1' }] });

            await service.decideApproval('p1', { approved: true });

            expect(atomic().map((e: any) => e.stream)).toEqual(['job.approval.changed']);
        });

        it('an approval can come after a rejection (second look)', async () => {
            const { service, row, atomic } = setup({ approvalStatus: 'rejected', approvalNote: 'unclear' });

            await service.decideApproval('p1', { approved: true });

            expect(row).toMatchObject({ approvalStatus: 'approved', approvalNote: null });
            expect(atomic().map((e: any) => e.stream)).toEqual(['jd.uploaded', 'job.approval.changed']);
        });
    });

    describe('decideApproval: reject', () => {
        it('stores the note, publishes only job.approval.changed (with the note) and releases nothing', async () => {
            const { service, row, atomic } = setup({ roles: [{ id: 'r1' }] });

            await service.decideApproval('p1', { approved: false, note: '  Salary range is missing  ' });

            expect(row).toMatchObject({ approvalStatus: 'rejected', approvalNote: 'Salary range is missing' });
            expect(atomic()).toEqual([{
                stream: 'job.approval.changed', head: ['MAXLEN', '~', 10000, '*', 'data'],
                data: { companyId: 'c1', jobPostingId: 'p1', status: 'rejected', note: 'Salary range is missing', requestId: expect.any(String) },
            }]);
        });

        it('leaves the note out of the event when there is none', async () => {
            const { service, atomic } = setup();

            await service.decideApproval('p1', { approved: false });

            expect(atomic()[0].data).not.toHaveProperty('note');
        });

        it('refuses to reject a posting that is already approved and live (409)', async () => {
            const { service, prisma, atomic } = setup({ approvalStatus: 'approved' });

            await expect(service.decideApproval('p1', { approved: false })).rejects.toBeInstanceOf(ConflictException);

            expect(prisma.jobPosting.updateMany).not.toHaveBeenCalled();
            expect(atomic()).toEqual([]);
        });
    });

    describe('decideApproval: safety', () => {
        it('the same decision twice is a no-op: no update, no second event', async () => {
            const { service, prisma, atomic } = setup({ approvalStatus: 'approved' });
            await service.decideApproval('p1', { approved: true });
            const rejected = setup({ approvalStatus: 'rejected' });
            await rejected.service.decideApproval('p1', { approved: false });

            expect(prisma.jobPosting.updateMany).not.toHaveBeenCalled();
            expect(atomic()).toEqual([]);
            expect(rejected.prisma.jobPosting.updateMany).not.toHaveBeenCalled();
            expect(rejected.atomic()).toEqual([]);
        });

        it('answers 404 for an unknown posting', async () => {
            const { service } = setup({ missing: true });

            await expect(service.decideApproval('nope', { approved: true })).rejects.toBeInstanceOf(NotFoundException);
        });

        it('when somebody else decided in the meantime, nothing is published', async () => {
            const { service, prisma, atomic } = setup();
            prisma.jobPosting.updateMany.mockResolvedValueOnce({ count: 0 });

            await service.decideApproval('p1', { approved: true });

            expect(atomic()).toEqual([]);
        });

        it.each([
            ['the transaction cannot run', (p: any) => p.exec.mockRejectedValue(new Error('redis down'))],
            ['the transaction was aborted', (p: any) => p.exec.mockResolvedValue(null)],
            ['one command in it failed', (p: any) => p.exec.mockResolvedValue([[null, '1-0'], [new Error('OOM'), null]])],
        ])('rolls the decision back and answers 503 when %s', async (_name, breakIt) => {
            const { service, row, pipeline } = setup({ approvalNote: 'old note' });
            breakIt(pipeline);

            await expect(service.decideApproval('p1', { approved: true, note: 'ok' })).rejects.toBeInstanceOf(ServiceUnavailableException);

            expect(row).toMatchObject({ approvalStatus: 'pending', approvalNote: 'old note' });
        });
    });

    describe('nothing is scanned or matched before the approval', () => {
        it('a role created by hand on a pending or rejected posting is saved but not matched', async () => {
            for (const approvalStatus of ['pending', 'rejected']) {
                const { service, prisma, single } = setup({ approvalStatus });

                await service.createRole('p1', 'c1', { title: 'Dev', requiredSkills: ['Java'] });

                expect(prisma.jobRole.create).toHaveBeenCalled();
                expect(single()).toEqual([]);
            }
        });

        it('editing a role of such a posting does not trigger matching either', async () => {
            const { service, single } = setup({ approvalStatus: 'pending' });

            await service.updateRole('r1', 'c1', { title: 'New title' });

            expect(single()).toEqual([]);
        });

        it('an approved posting still gets jd.extracted for a new role', async () => {
            const { service, single } = setup({ approvalStatus: 'approved' });

            await service.createRole('p1', 'c1', { title: 'Dev', requiredSkills: ['Java'] });

            expect(single()).toEqual([{
                stream: 'jd.extracted', head: ['MAXLEN', '~', 10000, '*', 'data'],
                data: { jobPostingId: 'p1', companyId: 'c1', roleIds: ['r-new'], requestId: expect.any(String) },
            }]);
        });

        it('reopening a stopped job that is not approved clears the stop but processes nothing', async () => {
            const { service, row, single } = setup({ approvalStatus: 'pending', stoppedAt: new Date() });

            await service.reopen('p1', 'c1');

            expect(row.stoppedAt).toBeNull();
            expect(single()).toEqual([]);
        });

        it('reopening an approved job whose document was never scanned publishes jd.uploaded', async () => {
            const { service, single } = setup({ approvalStatus: 'approved', status: 'pending', stoppedAt: new Date() });

            await service.reopen('p1', 'c1');

            expect(single().map((e: any) => e.stream)).toEqual(['jd.uploaded']);
        });
    });

    describe('events carry MAXLEN and a requestId', () => {
        it('job.stopped and job.role.deleted too', async () => {
            const { service, single } = setup({ approvalStatus: 'approved' });

            await service.stop('p1', 'c1');
            await service.deleteRole('r1', 'c1');

            expect(single().map((e: any) => e.stream)).toEqual(['job.stopped', 'job.role.deleted']);
            for (const e of single()) {
                expect(e.head).toEqual(['MAXLEN', '~', 10000, '*', 'data']);
                expect(e.data.requestId).toEqual(expect.any(String));
            }
        });
    });
});
