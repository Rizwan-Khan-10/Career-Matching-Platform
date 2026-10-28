import { BadRequestException, NotFoundException } from '@nestjs/common';
import { JobsService } from './jobs.service';

// the generated Prisma client is not needed here (and cannot load outside the real app): mock what jobs.service imports
jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('../redis/redis.service', () => ({ RedisService: class {} }));
jest.mock('../storage/storage.service', () => ({ StorageService: class {} }));
jest.mock('../generated/prisma', () => ({ Prisma: {} }));

const POSTING = { id: 'p1', companyId: 'c1', approvalStatus: 'approved' };

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
    const service = new JobsService(prisma as any, redis as any, {} as any, {} as any);
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
                minExperienceYears: null, maxExperienceYears: null, strictMinExperience: null,
                salaryMin: null, salaryMax: null, salaryCurrency: null, salaryPeriod: null, qualifications: null, responsibilities: [], level: null,
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

        it('stores the experience band the company set (max null = no upper limit)', async () => {
            const { service, prisma } = setup();
            await service.createRole('p1', 'c1', {
                title: 'Backend Developer', requiredSkills: ['Java'], minExperienceYears: 2, maxExperienceYears: 4, strictMinExperience: true,
            });
            expect(storedRequirements(prisma, 'create')).toMatchObject({ minExperienceYears: 2, maxExperienceYears: 4, strictMinExperience: true });
        });

        it('stores the salary; currency and period default to INR per year', async () => {
            const { service, prisma } = setup();
            await service.createRole('p1', 'c1', { title: 'A', requiredSkills: ['Java'], salaryMin: 400000, salaryMax: 600000 });
            expect(storedRequirements(prisma, 'create')).toMatchObject({ salaryMin: 400000, salaryMax: 600000, salaryCurrency: 'INR', salaryPeriod: 'year' });
        });

        it('accepts one salary bound alone, and keeps a given currency / period', async () => {
            const { service, prisma } = setup();
            await service.createRole('p1', 'c1', { title: 'A', requiredSkills: ['Java'], salaryMax: 5000, salaryCurrency: 'USD', salaryPeriod: 'month' });
            expect(storedRequirements(prisma, 'create')).toMatchObject({ salaryMin: null, salaryMax: 5000, salaryCurrency: 'USD', salaryPeriod: 'month' });
        });

        it('rejects a salary max below the min and saves nothing', async () => {
            const { service, prisma } = setup();
            await expect(service.createRole('p1', 'c1', { title: 'A', requiredSkills: ['Java'], salaryMin: 9, salaryMax: 3 })).rejects.toBeInstanceOf(BadRequestException);
            expect(prisma.jobRole.create).not.toHaveBeenCalled();
        });

        it('rejects a max below the min and saves nothing', async () => {
            const { service, prisma } = setup();
            await expect(service.createRole('p1', 'c1', {
                title: 'Backend Developer', requiredSkills: ['Java'], minExperienceYears: 5, maxExperienceYears: 2,
            })).rejects.toBeInstanceOf(BadRequestException);
            expect(prisma.jobRole.create).not.toHaveBeenCalled();
        });

        it('accepts max equal to min, and max without a min', async () => {
            const { service } = setup();
            await expect(service.createRole('p1', 'c1', { title: 'A', requiredSkills: ['Java'], minExperienceYears: 3, maxExperienceYears: 3 })).resolves.toBeDefined();
            await expect(service.createRole('p1', 'c1', { title: 'A', requiredSkills: ['Java'], maxExperienceYears: 1 })).resolves.toBeDefined();
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

        it('checks the experience band on the MERGED values', async () => {
            const { service, prisma } = setup({ ...existing, minExperienceYears: 3 });
            await expect(service.updateRole('r1', 'c1', { maxExperienceYears: 2 })).rejects.toBeInstanceOf(BadRequestException);
            expect(prisma.jobRole.update).not.toHaveBeenCalled();
            await service.updateRole('r1', 'c1', { maxExperienceYears: 5 });
            expect(storedRequirements(prisma, 'update')).toMatchObject({ minExperienceYears: 3, maxExperienceYears: 5 });
        });

        it('salary: merged check, and clearing both bounds clears currency and period too', async () => {
            const { service, prisma } = setup({ ...existing, salaryMin: 500000, salaryMax: 700000, salaryCurrency: 'INR', salaryPeriod: 'year' });
            await expect(service.updateRole('r1', 'c1', { salaryMax: 100000 })).rejects.toBeInstanceOf(BadRequestException);
            await service.updateRole('r1', 'c1', { salaryMin: null, salaryMax: null });
            expect(storedRequirements(prisma, 'update')).toMatchObject({ salaryMin: null, salaryMax: null, salaryCurrency: null, salaryPeriod: null });
        });

        it('null clears the max (= no upper limit again)', async () => {
            const { service, prisma } = setup({ ...existing, maxExperienceYears: 1 });
            await service.updateRole('r1', 'c1', { maxExperienceYears: null });
            expect(storedRequirements(prisma, 'update').maxExperienceYears).toBeNull();
        });

        it('does not re-check the band when the request does not touch it', async () => {
            const { service } = setup({ ...existing, minExperienceYears: 5, maxExperienceYears: 2 });   // odd old data
            await expect(service.updateRole('r1', 'c1', { title: 'Renamed' })).resolves.toBeDefined();
        });

        it('still answers 404 for an unknown role', async () => {
            const { service, prisma } = setup();
            prisma.jobRole.findUnique.mockResolvedValue(null);
            await expect(service.updateRole('x', 'c1', {})).rejects.toBeInstanceOf(NotFoundException);
        });
    });
});
