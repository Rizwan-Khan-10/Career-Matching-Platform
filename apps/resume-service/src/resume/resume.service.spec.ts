import { BadRequestException, ConflictException, ForbiddenException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ResumeService } from './resume.service';
import { ResumeRemovalService } from '../cleanup/resume-removal.service';
import { requestIdMiddleware } from '../common/request-context';

const file = { originalname: 'cv.pdf', size: 100, buffer: Buffer.from('x') } as Express.Multer.File;
const dto = { targetTrack: 'backend', targetStack: 'java' };

const parsedResume = {
    id: 'new-1',
    applicantId: 'app-1',
    status: 'parsed',
    parsedData: { skills: ['Java', 'Spring'] },
    targetTrack: 'backend',
    targetStack: 'java',
    targetKey: 'backend:java',
    confirmedAt: null as Date | null,
    supersededAt: null as Date | null,
    cloudinaryPublicId: 'resumes/app-1/new.pdf',
    pdfPublicId: null,
};
const oldActive = {
    ...parsedResume,
    id: 'old-1',
    confirmedAt: new Date('2026-01-01'),
    cloudinaryPublicId: 'resumes/app-1/old.pdf',
    pdfPublicId: 'resumes/app-1/pdf/old.pdf',
};

function setup() {
    const tx = {
        $executeRaw: jest.fn().mockResolvedValue(1),
        resume: {
            findUnique: jest.fn().mockResolvedValue(parsedResume),
            findMany: jest.fn().mockResolvedValue([]),
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            update: jest.fn().mockImplementation(({ where, data }) => Promise.resolve({ ...parsedResume, id: where.id, ...data })),
        },
    };
    const prisma = {
        resume: {
            findMany: jest.fn().mockResolvedValue([]),
            findUnique: jest.fn().mockResolvedValue(parsedResume),
            findFirst: jest.fn().mockResolvedValue(null),
            count: jest.fn().mockResolvedValue(0),
            create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'new-id', ...data })),
            update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...parsedResume, ...data })),
            delete: jest.fn().mockResolvedValue({}),
        },
        $executeRaw: jest.fn().mockResolvedValue(1),
        $queryRaw: jest.fn().mockResolvedValue([]), // no approved match
        $transaction: jest.fn().mockImplementation((cb: (t: typeof tx) => unknown) => cb(tx)),
    };
    const redis = { client: { xadd: jest.fn().mockResolvedValue('1-0') } };
    const storage = {
        uploadResume: jest.fn().mockResolvedValue({ publicId: 'resumes/a/new.pdf', fileUrl: 'http://signed' }),
        destroyResumeFiles: jest.fn().mockResolvedValue(true),
    };
    const removal = new ResumeRemovalService(prisma as any, redis as any, storage as any);
    const service = new ResumeService(prisma as any, redis as any, storage as any, removal);
    return { prisma, tx, redis, storage, service };
}

/** [stream, payload] of every XADD call, in order */
const published = (redis: { client: { xadd: jest.Mock } }) =>
    redis.client.xadd.mock.calls.map((c) => [c[0], JSON.parse(c[6])] as [string, Record<string, any>]);

describe('ResumeService.upload', () => {
    it('stores the target role, key and label and publishes resume.uploaded', async () => {
        const { service, prisma, redis } = setup();
        const res = await service.upload('app-1', file, dto);

        expect(prisma.resume.create.mock.calls[0][0].data).toMatchObject({
            applicantId: 'app-1',
            targetTrack: 'backend',
            targetStack: 'java',
            targetKey: 'backend:java',
            status: 'pending',
        });
        expect(res.targetLabel).toBe('Backend · Java');
        const args = redis.client.xadd.mock.calls[0];
        expect(args.slice(0, 4)).toEqual(['resume.uploaded', 'MAXLEN', '~', 10000]);
    });

    it('puts a requestId into resume.uploaded (contract 3.1)', async () => {
        const { service, redis } = setup();
        await service.upload('app-1', file, dto);
        const [[stream, payload]] = published(redis);
        expect(stream).toBe('resume.uploaded');
        expect(payload).toMatchObject({ applicantId: 'app-1', resumeId: 'new-id' });
        expect(typeof payload.requestId).toBe('string');
    });

    it('uses the x-request-id of the HTTP request for the event', async () => {
        const { service, redis } = setup();
        await new Promise<void>((resolve, reject) => {
            requestIdMiddleware({ headers: { 'x-request-id': 'req-42' } } as any, { setHeader: () => undefined } as any, () => {
                service.upload('app-1', file, dto).then(() => resolve(), reject);
            });
        });
        expect(published(redis)[0][1].requestId).toBe('req-42');
    });

    it('rejects a stack that does not belong to the track (400) before touching storage', async () => {
        const { service, storage } = setup();
        await expect(service.upload('app-1', file, { targetTrack: 'frontend', targetStack: 'java' })).rejects.toBeInstanceOf(BadRequestException);
        expect(storage.uploadResume).not.toHaveBeenCalled();
    });

    it('allows the "other" stack', async () => {
        const { service, prisma } = setup();
        await service.upload('app-1', file, { targetTrack: 'backend', targetStack: 'other' });
        expect(prisma.resume.create.mock.calls[0][0].data.targetKey).toBe('backend:other');
    });

    it('returns 409 when the applicant already has 5 non-superseded resumes', async () => {
        const { service, prisma, storage } = setup();
        prisma.resume.count.mockResolvedValue(5);
        await expect(service.upload('app-1', file, dto)).rejects.toBeInstanceOf(ConflictException);
        expect(storage.uploadResume).not.toHaveBeenCalled();
        expect(prisma.resume.create).not.toHaveBeenCalled();
    });

    it('counts only non-superseded resumes', async () => {
        const { service, prisma } = setup();
        await service.upload('app-1', file, dto);
        expect(prisma.resume.count.mock.calls[0][0].where).toMatchObject({ applicantId: 'app-1', supersededAt: null });
    });

    it('allows the 6th upload when it replaces an unconfirmed upload of the same target', async () => {
        const { service, prisma } = setup();
        prisma.resume.findMany.mockResolvedValue([{ id: 'old-1', cloudinaryPublicId: 'resumes/a/old.pdf', pdfPublicId: null }]);
        prisma.resume.count.mockResolvedValue(4); // 5 total minus the one being replaced
        await expect(service.upload('app-1', file, dto)).resolves.toBeDefined();
        expect(prisma.resume.count.mock.calls[0][0].where.id).toEqual({ notIn: ['old-1'] });
    });

    it('deletes the older unconfirmed upload of the same target (file, PDF and row)', async () => {
        const { service, prisma, storage } = setup();
        prisma.resume.findMany.mockResolvedValue([{ id: 'old-1', cloudinaryPublicId: 'resumes/a/old.pdf', pdfPublicId: 'resumes/a/pdf/old.pdf' }]);
        await service.upload('app-1', file, dto);

        expect(prisma.resume.findMany.mock.calls[0][0].where).toEqual({
            applicantId: 'app-1',
            targetKey: 'backend:java',
            confirmedAt: null,
            supersededAt: null,
        });
        expect(storage.destroyResumeFiles).toHaveBeenCalledWith('resumes/a/old.pdf', 'resumes/a/pdf/old.pdf');
        expect(prisma.resume.delete).toHaveBeenCalledWith({ where: { id: 'old-1' } });
    });

    it('keeps the old row when Cloudinary deletion fails (cleanup job retries)', async () => {
        const { service, prisma, storage } = setup();
        prisma.resume.findMany.mockResolvedValue([{ id: 'old-1', cloudinaryPublicId: 'x', pdfPublicId: null }]);
        storage.destroyResumeFiles.mockResolvedValue(false);
        await service.upload('app-1', file, dto);
        expect(prisma.resume.delete).not.toHaveBeenCalled();
    });
});

describe('ResumeService.getByApplicant', () => {
    it('adds targetLabel to every resume', async () => {
        const { service, prisma } = setup();
        prisma.resume.findMany.mockResolvedValue([{ id: 'r1', targetTrack: 'mobile', targetStack: 'android' }]);
        const [r] = await service.getByApplicant('app-1');
        expect(r.targetLabel).toBe('Mobile · Android');
    });

    it('returns confirmedAt and supersededAt', async () => {
        const { service, prisma } = setup();
        const confirmedAt = new Date('2026-02-01');
        prisma.resume.findMany.mockResolvedValue([
            { id: 'r1', targetTrack: 'backend', targetStack: 'java', status: 'parsed', confirmedAt, supersededAt: null },
        ]);
        const [r] = await service.getByApplicant('app-1');
        expect(r).toMatchObject({ status: 'parsed', confirmedAt, supersededAt: null });
    });
});

describe('ResumeService.confirm', () => {
    it('returns 404 for an unknown resume and 403 for someone else\'s', async () => {
        const { service, prisma } = setup();
        prisma.resume.findUnique.mockResolvedValueOnce(null);
        await expect(service.confirm('x', 'app-1')).rejects.toBeInstanceOf(NotFoundException);
        prisma.resume.findUnique.mockResolvedValueOnce({ ...parsedResume, applicantId: 'someone-else' });
        await expect(service.confirm('new-1', 'app-1')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('returns 400 when the resume is not parsed yet', async () => {
        const { service, prisma, redis } = setup();
        prisma.resume.findUnique.mockResolvedValue({ ...parsedResume, status: 'pending' });
        await expect(service.confirm('new-1', 'app-1')).rejects.toBeInstanceOf(BadRequestException);
        expect(prisma.$transaction).not.toHaveBeenCalled();
        expect(redis.client.xadd).not.toHaveBeenCalled();
    });

    it('returns 400 when there is no skill', async () => {
        const { service, prisma } = setup();
        prisma.resume.findUnique.mockResolvedValue({ ...parsedResume, parsedData: { skills: [] } });
        await expect(service.confirm('new-1', 'app-1')).rejects.toBeInstanceOf(BadRequestException);
        prisma.resume.findUnique.mockResolvedValue({ ...parsedResume, parsedData: null });
        await expect(service.confirm('new-1', 'app-1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('returns 409 for a superseded resume', async () => {
        const { service, prisma } = setup();
        prisma.resume.findUnique.mockResolvedValue({ ...parsedResume, supersededAt: new Date() });
        await expect(service.confirm('new-1', 'app-1')).rejects.toBeInstanceOf(ConflictException);
    });

    it('sets confirmedAt and publishes resume.confirmed with the contract payload', async () => {
        const { service, tx, redis } = setup();
        const res = await service.confirm('new-1', 'app-1');

        expect(tx.resume.update.mock.calls[0][0].data.confirmedAt).toBeInstanceOf(Date);
        expect(res.targetLabel).toBe('Backend · Java');
        expect(redis.client.xadd.mock.calls[0].slice(0, 4)).toEqual(['resume.confirmed', 'MAXLEN', '~', 10000]);
        const [[, payload]] = published(redis);
        expect(payload).toMatchObject({ resumeId: 'new-1', applicantId: 'app-1', targetTrack: 'backend', targetStack: 'java' });
        expect(typeof payload.requestId).toBe('string');
    });

    it('looks for the active resume of the same target key only (not itself)', async () => {
        const { service, tx } = setup();
        await service.confirm('new-1', 'app-1');
        expect(tx.resume.findMany.mock.calls[0][0].where).toMatchObject({
            applicantId: 'app-1',
            targetKey: 'backend:java',
            confirmedAt: { not: null },
            supersededAt: null,
            id: { not: 'new-1' },
        });
    });

    it('replaces the old active resume: supersedes it in the transaction, publishes resume.superseded, deletes it completely', async () => {
        const { service, tx, redis, storage, prisma } = setup();
        tx.resume.findMany.mockResolvedValue([oldActive]);
        await service.confirm('new-1', 'app-1');

        expect(prisma.$transaction).toHaveBeenCalledTimes(1);
        expect(tx.resume.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['old-1'] } }, data: { supersededAt: expect.any(Date) } });
        const events = published(redis);
        expect(events.map(([s]) => s)).toEqual(['resume.superseded', 'resume.confirmed']);
        expect(events[0][1]).toMatchObject({ resumeId: 'old-1', applicantId: 'app-1' });
        expect(events[0][1].requestId).toBe(events[1][1].requestId);

        expect(storage.destroyResumeFiles).toHaveBeenCalledWith('resumes/app-1/old.pdf', 'resumes/app-1/pdf/old.pdf');
        expect(prisma.resume.delete).toHaveBeenCalledWith({ where: { id: 'old-1' } });
    });

    it('keeps the files of a replaced resume that an approved match still uses (stays superseded)', async () => {
        const { service, tx, redis, storage, prisma } = setup();
        tx.resume.findMany.mockResolvedValue([oldActive]);
        prisma.$queryRaw.mockResolvedValue([{ ok: 1 }]);
        await service.confirm('new-1', 'app-1');

        expect(tx.resume.updateMany).toHaveBeenCalled(); // supersededAt is still set
        expect(published(redis).map(([s]) => s)).toContain('resume.superseded');
        expect(storage.destroyResumeFiles).not.toHaveBeenCalled();
        expect(prisma.resume.delete).not.toHaveBeenCalled();
    });

    it('keeps the files when the approved-match check itself fails', async () => {
        const { service, tx, storage, prisma } = setup();
        tx.resume.findMany.mockResolvedValue([oldActive]);
        prisma.$queryRaw.mockRejectedValue(new Error('db down'));
        await service.confirm('new-1', 'app-1');
        expect(storage.destroyResumeFiles).not.toHaveBeenCalled();
    });

    it('still succeeds when Cloudinary deletion of the replaced resume fails (daily job retries)', async () => {
        const { service, tx, storage, prisma } = setup();
        tx.resume.findMany.mockResolvedValue([oldActive]);
        storage.destroyResumeFiles.mockResolvedValue(false);
        await expect(service.confirm('new-1', 'app-1')).resolves.toBeDefined();
        expect(prisma.resume.delete).not.toHaveBeenCalled();
    });

    it('does not supersede anything when there is no older active resume', async () => {
        const { service, tx, redis } = setup();
        await service.confirm('new-1', 'app-1');
        expect(tx.resume.updateMany).not.toHaveBeenCalled();
        expect(published(redis).map(([s]) => s)).toEqual(['resume.confirmed']);
    });

    it('re-publishes resume.confirmed for an already confirmed resume without changing anything', async () => {
        const { service, prisma, tx, redis } = setup();
        prisma.resume.findUnique.mockResolvedValue({ ...parsedResume, confirmedAt: new Date() });
        await service.confirm('new-1', 'app-1');
        expect(prisma.$transaction).not.toHaveBeenCalled();
        expect(tx.resume.update).not.toHaveBeenCalled();
        expect(published(redis).map(([s]) => s)).toEqual(['resume.confirmed']);
    });

    it('returns 503 with a clear message when resume.confirmed cannot be published', async () => {
        const { service, redis } = setup();
        redis.client.xadd.mockRejectedValue(new Error('redis down'));
        await expect(service.confirm('new-1', 'app-1')).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
});

describe('ResumeService.updateOwn', () => {
    const confirmed = { ...parsedResume, confirmedAt: new Date('2026-01-01') };

    it('returns 404 / 403 / 409 for missing, foreign and superseded resumes', async () => {
        const { service, prisma } = setup();
        prisma.resume.findUnique.mockResolvedValueOnce(null);
        await expect(service.updateOwn('x', 'app-1', {})).rejects.toBeInstanceOf(NotFoundException);
        prisma.resume.findUnique.mockResolvedValueOnce({ ...parsedResume, applicantId: 'other' });
        await expect(service.updateOwn('new-1', 'app-1', {})).rejects.toBeInstanceOf(ForbiddenException);
        prisma.resume.findUnique.mockResolvedValueOnce({ ...parsedResume, supersededAt: new Date() });
        await expect(service.updateOwn('new-1', 'app-1', {})).rejects.toBeInstanceOf(ConflictException);
    });

    it('merges branch, passingYear and backlogs into parsedData', async () => {
        const { service, prisma } = setup();
        await service.updateOwn('new-1', 'app-1', { branch: 'Computer Science', passingYear: 2026, backlogs: 0 });
        expect(prisma.resume.update.mock.calls[0][0].data.parsedData).toEqual({
            skills: ['Java', 'Spring'],
            branch: 'Computer Science',
            passingYear: 2026,
            backlogs: 0,
        });
    });

    it('does NOT publish resume.updated for an unconfirmed resume', async () => {
        const { service, redis } = setup();
        await service.updateOwn('new-1', 'app-1', { skills: ['Go'] });
        expect(redis.client.xadd).not.toHaveBeenCalled();
    });

    it('publishes resume.updated (with MAXLEN) for a confirmed resume', async () => {
        const { service, prisma, redis } = setup();
        prisma.resume.findUnique.mockResolvedValue(confirmed);
        await service.updateOwn('new-1', 'app-1', { backlogs: 1 });

        expect(redis.client.xadd.mock.calls[0].slice(0, 4)).toEqual(['resume.updated', 'MAXLEN', '~', 10000]);
        const [[, payload]] = published(redis);
        expect(payload).toMatchObject({ resumeId: 'new-1', applicantId: 'app-1', backlogs: 1, skills: ['Java', 'Spring'] });
    });

    it('still saves the edit when publishing resume.updated fails', async () => {
        const { service, prisma, redis } = setup();
        prisma.resume.findUnique.mockResolvedValue(confirmed);
        redis.client.xadd.mockRejectedValue(new Error('redis down'));
        await expect(service.updateOwn('new-1', 'app-1', { backlogs: 1 })).resolves.toBeDefined();
    });

    it('changes the target role while unconfirmed, without touching parsedData or publishing', async () => {
        const { service, prisma, redis } = setup();
        const res = await service.updateOwn('new-1', 'app-1', { targetTrack: 'backend', targetStack: 'python' });
        const data = prisma.resume.update.mock.calls[0][0].data;
        expect(data).toEqual({ targetTrack: 'backend', targetStack: 'python', targetKey: 'backend:python' });
        expect(res.targetLabel).toBe('Backend · Python');
        expect(redis.client.xadd).not.toHaveBeenCalled();
    });

    it('keeps target fields out of parsedData when both are sent together', async () => {
        const { service, prisma } = setup();
        await service.updateOwn('new-1', 'app-1', { skills: ['Go'], targetTrack: 'mobile', targetStack: 'android' });
        const data = prisma.resume.update.mock.calls[0][0].data;
        expect(data.parsedData).toEqual({ skills: ['Go'] });
        expect(data.targetKey).toBe('mobile:android');
    });

    it('rejects a target change on a confirmed resume (409)', async () => {
        const { service, prisma } = setup();
        prisma.resume.findUnique.mockResolvedValue(confirmed);
        await expect(service.updateOwn('new-1', 'app-1', { targetStack: 'python' })).rejects.toBeInstanceOf(ConflictException);
        expect(prisma.resume.update).not.toHaveBeenCalled();
    });

    it('accepts the same target on a confirmed resume (a form that always sends it)', async () => {
        const { service, prisma } = setup();
        prisma.resume.findUnique.mockResolvedValue(confirmed);
        await expect(service.updateOwn('new-1', 'app-1', { targetTrack: 'backend', targetStack: 'java', skills: ['Go'] })).resolves.toBeDefined();
    });

    it('rejects a stack that does not belong to the track (400)', async () => {
        const { service, prisma } = setup();
        await expect(service.updateOwn('new-1', 'app-1', { targetTrack: 'frontend', targetStack: 'java' })).rejects.toBeInstanceOf(BadRequestException);
        expect(prisma.resume.update).not.toHaveBeenCalled();
    });

    it('rejects a target that another unconfirmed upload already uses (409)', async () => {
        const { service, prisma } = setup();
        prisma.resume.findFirst.mockResolvedValue({ id: 'other-pending' });
        await expect(service.updateOwn('new-1', 'app-1', { targetStack: 'python' })).rejects.toBeInstanceOf(ConflictException);
        expect(prisma.resume.update).not.toHaveBeenCalled();
    });
});

describe('ResumeService.deleteOwn', () => {
    const active = { ...parsedResume, confirmedAt: new Date('2026-01-01'), pdfPublicId: 'resumes/app-1/pdf/new-1.pdf' };

    it('returns 404 for an unknown resume and 403 for someone else\'s', async () => {
        const { service, prisma } = setup();
        prisma.resume.findUnique.mockResolvedValueOnce(null);
        await expect(service.deleteOwn('x', 'app-1')).rejects.toBeInstanceOf(NotFoundException);
        prisma.resume.findUnique.mockResolvedValueOnce({ ...parsedResume, applicantId: 'other' });
        await expect(service.deleteOwn('new-1', 'app-1')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('returns 409 and deletes nothing when an approved match uses the resume', async () => {
        const { service, prisma, storage, redis } = setup();
        prisma.resume.findUnique.mockResolvedValue(active);
        prisma.$queryRaw.mockResolvedValue([{ ok: 1 }]);

        await expect(service.deleteOwn('new-1', 'app-1')).rejects.toBeInstanceOf(ConflictException);
        expect(storage.destroyResumeFiles).not.toHaveBeenCalled();
        expect(prisma.resume.delete).not.toHaveBeenCalled();
        expect(redis.client.xadd).not.toHaveBeenCalled();
    });

    it('removes an active resume completely (original, PDF, embedding, row) and publishes resume.deleted', async () => {
        const { service, prisma, storage, redis } = setup();
        prisma.resume.findUnique.mockResolvedValue(active);

        await expect(service.deleteOwn('new-1', 'app-1')).resolves.toEqual({ deleted: true });
        expect(storage.destroyResumeFiles).toHaveBeenCalledWith('resumes/app-1/new.pdf', 'resumes/app-1/pdf/new-1.pdf');
        expect(prisma.$executeRaw).toHaveBeenCalled(); // resume_embeddings row
        expect(prisma.resume.delete).toHaveBeenCalledWith({ where: { id: 'new-1' } });
        expect(published(redis)).toEqual([['resume.deleted', expect.objectContaining({ resumeId: 'new-1', applicantId: 'app-1' })]]);
    });

    it('publishes no resume.deleted for an unconfirmed resume (it was never active)', async () => {
        const { service, prisma, redis } = setup();
        await service.deleteOwn('new-1', 'app-1'); // parsedResume is unconfirmed
        expect(prisma.resume.delete).toHaveBeenCalled();
        expect(redis.client.xadd).not.toHaveBeenCalled();
    });

    it('publishes no resume.deleted for a superseded resume (resume.superseded was already sent)', async () => {
        const { service, prisma, redis } = setup();
        prisma.resume.findUnique.mockResolvedValue({ ...active, supersededAt: new Date() });
        await service.deleteOwn('new-1', 'app-1');
        expect(prisma.resume.delete).toHaveBeenCalled();
        expect(redis.client.xadd).not.toHaveBeenCalled();
    });

    it('returns 503, keeps the row and publishes nothing when Cloudinary fails', async () => {
        const { service, prisma, storage, redis } = setup();
        prisma.resume.findUnique.mockResolvedValue(active);
        storage.destroyResumeFiles.mockResolvedValue(false);

        await expect(service.deleteOwn('new-1', 'app-1')).rejects.toBeInstanceOf(ServiceUnavailableException);
        expect(prisma.resume.delete).not.toHaveBeenCalled();
        expect(redis.client.xadd).not.toHaveBeenCalled();
    });

    it('returns 503 (not a wrong 409) when the approved-match check cannot be made', async () => {
        const { service, prisma, storage } = setup();
        prisma.resume.findUnique.mockResolvedValue(active);
        prisma.$queryRaw.mockRejectedValue(new Error('db down'));

        await expect(service.deleteOwn('new-1', 'app-1')).rejects.toBeInstanceOf(ServiceUnavailableException);
        expect(storage.destroyResumeFiles).not.toHaveBeenCalled();
    });
});
describe('ResumeService.getSharedPdfLink audit', () => {
    const shared = { ...parsedResume, pdfPublicId: 'resumes/app-1/pdf/new.pdf' };
    let fetchMock: jest.SpyInstance;

    beforeEach(() => {
        process.env.USER_SERVICE_URL = 'http://user-service';
        fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true } as Response);
    });
    afterEach(() => {
        fetchMock.mockRestore();
        delete process.env.USER_SERVICE_URL;
    });

    it('writes resume.viewed when an admin opens a resume', async () => {
        const { service, prisma, storage } = setup();
        prisma.resume.findUnique.mockResolvedValue(shared);
        (storage as any).getSignedUrl = jest.fn().mockReturnValue('http://signed-pdf');

        const res = await service.getSharedPdfLink('new-1', 'admin-1', 'ADMIN');

        expect(res.url).toBe('http://signed-pdf');
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('http://user-service/internal/audit');
        expect(JSON.parse(init.body)).toEqual({ actorId: 'admin-1', action: 'resume.viewed', target: 'app-1', meta: { resumeId: 'new-1' } });
    });

    it('does not write an audit entry for a company', async () => {
        const { service, prisma, storage } = setup();
        prisma.resume.findUnique.mockResolvedValue(shared);
        prisma.$queryRaw.mockResolvedValue([{ ok: 1 }]);
        (storage as any).getSignedUrl = jest.fn().mockReturnValue('http://signed-pdf');

        await service.getSharedPdfLink('new-1', 'company-1', 'COMPANY');

        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('still returns the PDF when the audit call fails', async () => {
        const { service, prisma, storage } = setup();
        prisma.resume.findUnique.mockResolvedValue(shared);
        (storage as any).getSignedUrl = jest.fn().mockReturnValue('http://signed-pdf');
        fetchMock.mockRejectedValue(new Error('user-service down'));

        await expect(service.getSharedPdfLink('new-1', 'admin-1', 'ADMIN')).resolves.toMatchObject({ url: 'http://signed-pdf' });
    });
});
