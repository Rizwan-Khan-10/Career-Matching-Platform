import { BadRequestException, NotFoundException } from '@nestjs/common';
import { JobsService } from './jobs.service';

// the generated Prisma client is not needed here (and cannot load outside the real app): mock what jobs.service imports
jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('../redis/redis.service', () => ({ RedisService: class {} }));
jest.mock('../storage/storage.service', () => ({ StorageService: class {} }));
jest.mock('../generated/prisma', () => ({ Prisma: {} }));

const POSTING = { id: 'p1', companyId: 'c1' };

function setup(existingRequirements: Record<string, unknown> = {}) {
    const prisma = {
        jobPosting: { findUnique: jest.fn().mockResolvedValue(POSTING) },
        jobRole: {
            create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'r1', ...data })),
            findUnique: jest.fn().mockResolvedValue({ id: 'r1', jobPostingId: 'p1', title: 'Old', requirements: existingRequirements }),
            update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'r1', ...data })),
        },
    };
    const redis = { client: { xadd: jest.fn().mockResolvedValue('1-0') } };
    const service = new JobsService(prisma as any, redis as any, {} as any);
    return { service, prisma, redis };
}

const storedRequirements = (prisma: ReturnType<typeof setup>['prisma'], call: 'create' | 'update') =>
    (prisma.jobRole[call].mock.calls[0][0] as any).data.requirements;

describe('JobsService roles (contract 4.1)', () => {
    describe('createRole', () => {
        it('stores every requirement key; unset rules are null (stacks [] = any stack)', async () => {
            const { service, prisma } = setup();
            await service.createRole('p1', 'c1', { title: 'Backend Developer', requiredSkills: ['Java'] });
            expect(storedRequirements(prisma, 'create')).toEqual({
                title: 'Backend Developer', summary: null, requiredSkills: ['Java'], preferredSkills: [],
                minExperienceYears: null, qualifications: null, responsibilities: [], level: null,
                track: null, stacks: [], minCgpa: null, allowedBranches: null, passingYears: null, maxBacklogs: null,
            });
        });

        it('stores the values it was given', async () => {
            const { service, prisma } = setup();
            await service.createRole('p1', 'c1', {
                title: 'Backend Developer', requiredSkills: ['Java'], level: 'fresher', track: 'backend', stacks: ['java'],
                minCgpa: 7, allowedBranches: ['Computer Science'], passingYears: [2026, 2027], maxBacklogs: 0,
            });
            expect(storedRequirements(prisma, 'create')).toMatchObject({
                level: 'fresher', track: 'backend', stacks: ['java'], minCgpa: 7,
                allowedBranches: ['Computer Science'], passingYears: [2026, 2027], maxBacklogs: 0,
            });
        });

        it('turns empty allow-lists into "not set" (an empty list must never block everybody)', async () => {
            const { service, prisma } = setup();
            await service.createRole('p1', 'c1', { title: 'T', requiredSkills: [], allowedBranches: [], passingYears: [] });
            expect(storedRequirements(prisma, 'create')).toMatchObject({ allowedBranches: null, passingYears: null });
        });

        it('rejects stacks that do not belong to the track and saves nothing', async () => {
            const { service, prisma, redis } = setup();
            const err = await service.createRole('p1', 'c1', { title: 'T', requiredSkills: [], track: 'backend', stacks: ['android'] }).catch((e) => e);
            expect(err).toBeInstanceOf(BadRequestException);
            expect(err.message).toBe('Stack "android" does not belong to track "backend"');
            expect(prisma.jobRole.create).not.toHaveBeenCalled();
            expect(redis.client.xadd).not.toHaveBeenCalled();
        });

        it('rejects stacks without a track', async () => {
            const { service } = setup();
            await expect(service.createRole('p1', 'c1', { title: 'T', requiredSkills: [], stacks: ['java'] })).rejects.toThrow('Choose a track before choosing stacks');
        });
    });

    describe('updateRole', () => {
        const existing = { title: 'Old', requiredSkills: ['Java'], track: 'backend', stacks: ['java'], minCgpa: 7 };

        it('keeps keys that were not sent, even when the DTO instance has them as undefined', async () => {
            const { service, prisma } = setup(existing);
            await service.updateRole('r1', 'c1', { title: 'New', minCgpa: undefined, track: undefined } as any);
            expect(storedRequirements(prisma, 'update')).toEqual({ ...existing, title: 'New' });
        });

        it('null clears a rule', async () => {
            const { service, prisma } = setup(existing);
            await service.updateRole('r1', 'c1', { minCgpa: null });
            expect(storedRequirements(prisma, 'update').minCgpa).toBeNull();
        });

        it('validates the stacks against the track that is already stored', async () => {
            const { service, prisma } = setup(existing);
            await expect(service.updateRole('r1', 'c1', { stacks: ['android'] })).rejects.toBeInstanceOf(BadRequestException);
            expect(prisma.jobRole.update).not.toHaveBeenCalled();
        });

        it('rejects a track change that leaves the old stacks behind, accepts it when stacks come along', async () => {
            const { service, prisma } = setup(existing);
            await expect(service.updateRole('r1', 'c1', { track: 'mobile' })).rejects.toBeInstanceOf(BadRequestException);
            await service.updateRole('r1', 'c1', { track: 'mobile', stacks: ['android'] });
            expect(storedRequirements(prisma, 'update')).toMatchObject({ track: 'mobile', stacks: ['android'] });
        });

        it('does not re-validate track/stacks when the request does not touch them', async () => {
            const { service, prisma } = setup({ ...existing, track: 'backend', stacks: ['rust'] });
            await expect(service.updateRole('r1', 'c1', { title: 'Renamed' })).resolves.toBeDefined();
            expect(prisma.jobRole.update).toHaveBeenCalled();
        });

        it('still answers 404 for an unknown role', async () => {
            const { service, prisma } = setup();
            prisma.jobRole.findUnique.mockResolvedValue(null);
            await expect(service.updateRole('x', 'c1', {})).rejects.toBeInstanceOf(NotFoundException);
        });
    });
});
