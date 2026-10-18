import { BadRequestException, ConflictException } from '@nestjs/common';
import { ResumeService } from './resume.service';

const file = { originalname: 'cv.pdf', size: 100, buffer: Buffer.from('x') } as Express.Multer.File;
const dto = { targetTrack: 'backend', targetStack: 'java' };

function setup() {
    const prisma = {
        resume: {
            findMany: jest.fn().mockResolvedValue([]),
            count: jest.fn().mockResolvedValue(0),
            create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'new-id', ...data })),
            delete: jest.fn().mockResolvedValue({}),
        },
        $executeRaw: jest.fn().mockResolvedValue(1),
    };
    const redis = { client: { xadd: jest.fn().mockResolvedValue('1-0') } };
    const storage = {
        uploadResume: jest.fn().mockResolvedValue({ publicId: 'resumes/a/new.pdf', fileUrl: 'http://signed' }),
        destroyResumeFiles: jest.fn().mockResolvedValue(true),
    };
    const service = new ResumeService(prisma as any, redis as any, storage as any);
    return { prisma, redis, storage, service };
}

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
});