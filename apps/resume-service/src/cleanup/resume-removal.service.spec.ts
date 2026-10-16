import { ResumeRemovalService } from './resume-removal.service';

const resume = {
    id: 'r1',
    applicantId: 'app-1',
    cloudinaryPublicId: 'resumes/app-1/cv.docx',
    pdfPublicId: 'resumes/app-1/pdf/r1.pdf',
};

function setup() {
    const prisma = {
        $queryRaw: jest.fn().mockResolvedValue([]), // no approved match
        $executeRaw: jest.fn().mockResolvedValue(1),
        resume: { delete: jest.fn().mockResolvedValue({}) },
    };
    const redis = { client: { xadd: jest.fn().mockResolvedValue('1-0') } };
    const storage = { destroyResumeFiles: jest.fn().mockResolvedValue(true) };
    const service = new ResumeRemovalService(prisma as any, redis as any, storage as any);
    return { prisma, redis, storage, service };
}

describe('ResumeRemovalService.purge', () => {
    it('removes original + PDF, then the embedding row, then the DB row', async () => {
        const { service, prisma, storage } = setup();
        await expect(service.purge(resume)).resolves.toBe(true);

        expect(storage.destroyResumeFiles).toHaveBeenCalledWith('resumes/app-1/cv.docx', 'resumes/app-1/pdf/r1.pdf');
        expect(prisma.resume.delete).toHaveBeenCalledWith({ where: { id: 'r1' } });
        const order = (m: jest.Mock) => m.mock.invocationCallOrder[0];
        expect(order(storage.destroyResumeFiles)).toBeLessThan(order(prisma.$executeRaw));
        expect(order(prisma.$executeRaw)).toBeLessThan(order(prisma.resume.delete));
    });

    it('keeps the embedding and the DB row when Cloudinary fails (the daily job retries)', async () => {
        const { service, prisma, storage } = setup();
        storage.destroyResumeFiles.mockResolvedValue(false);
        await expect(service.purge(resume)).resolves.toBe(false);
        expect(prisma.$executeRaw).not.toHaveBeenCalled();
        expect(prisma.resume.delete).not.toHaveBeenCalled();
    });

    it('still deletes the row when the embeddings table does not exist yet', async () => {
        const { service, prisma } = setup();
        prisma.$executeRaw.mockRejectedValue(new Error('relation "resume_embeddings" does not exist'));
        await expect(service.purge(resume)).resolves.toBe(true);
        expect(prisma.resume.delete).toHaveBeenCalled();
    });
});

describe('ResumeRemovalService.removeIfUnused', () => {
    it('asks matches_service.Match for an APPROVED match of exactly this resume', async () => {
        const { service, prisma } = setup();
        await service.removeIfUnused(resume);
        const [strings, ...values] = prisma.$queryRaw.mock.calls[0];
        const sql = strings.join('?');
        expect(sql).toContain('"matches_service"."Match"');
        expect(sql).toContain('"applicantStatus" = \'approved\'');
        expect(values).toEqual(['r1']);
    });

    it('does not touch anything when an approved match uses the resume', async () => {
        const { service, prisma, storage } = setup();
        prisma.$queryRaw.mockResolvedValue([{ ok: 1 }]);
        await expect(service.removeIfUnused(resume)).resolves.toBe('in_use');
        expect(storage.destroyResumeFiles).not.toHaveBeenCalled();
        expect(prisma.resume.delete).not.toHaveBeenCalled();
    });

    it('removes an unused resume', async () => {
        const { service, prisma } = setup();
        await expect(service.removeIfUnused(resume)).resolves.toBe('removed');
        expect(prisma.resume.delete).toHaveBeenCalled();
    });

    it('reports files_failed when Cloudinary fails', async () => {
        const { service, storage, prisma } = setup();
        storage.destroyResumeFiles.mockResolvedValue(false);
        await expect(service.removeIfUnused(resume)).resolves.toBe('files_failed');
        expect(prisma.resume.delete).not.toHaveBeenCalled();
    });

    it('throws (and deletes nothing) when the approved-match check cannot be made', async () => {
        const { service, prisma, storage } = setup();
        prisma.$queryRaw.mockRejectedValue(new Error('db down'));
        await expect(service.removeIfUnused(resume)).rejects.toThrow('db down');
        expect(storage.destroyResumeFiles).not.toHaveBeenCalled();
    });
});

describe('ResumeRemovalService.publishDeleted', () => {
    it('publishes resume.deleted with MAXLEN and a requestId', async () => {
        const { service, redis } = setup();
        await service.publishDeleted(resume);
        const args = redis.client.xadd.mock.calls[0];
        expect(args.slice(0, 4)).toEqual(['resume.deleted', 'MAXLEN', '~', 10000]);
        const payload = JSON.parse(args[6]);
        expect(payload).toMatchObject({ resumeId: 'r1', applicantId: 'app-1' });
        expect(typeof payload.requestId).toBe('string');
    });

    it('never throws when Redis is down', async () => {
        const { service, redis } = setup();
        redis.client.xadd.mockRejectedValue(new Error('redis down'));
        await expect(service.publishDeleted(resume)).resolves.toBeUndefined();
    });
});