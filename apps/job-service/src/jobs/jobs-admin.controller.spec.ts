import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { RolesGuard } from '../auth/guards/roles.guard';
import { JobsAdminController } from './jobs-admin.controller';
import { JobsController } from './jobs.controller';
import { SetJobApprovalDto } from './dto/set-job-approval.dto';
import { InternalController } from '../internal/internal.controller';
import { InternalKeyGuard } from '../common/internal-key.guard';

jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('../redis/redis.service', () => ({ RedisService: class {} }));
jest.mock('../storage/storage.service', () => ({ StorageService: class {} }));
jest.mock('../generated/prisma', () => ({ Prisma: {} }));

/** Runs the REAL RolesGuard against a handler of a controller, exactly as Nest would. */
function allowed(controller: any, handler: string, role: string): boolean {
    const guard = new RolesGuard(new Reflector());
    const ctx = {
        getHandler: () => controller.prototype[handler],
        getClass: () => controller,
        switchToHttp: () => ({ getRequest: () => ({ user: { userId: 'u1', role } }) }),
    } as unknown as ExecutionContext;
    return guard.canActivate(ctx);
}

describe('who may call the approval endpoints', () => {
    it.each(['pending', 'decide'])('JobsAdminController.%s is for ADMIN only (the class-level COMPANY rule does not block it)', (handler) => {
        expect(allowed(JobsAdminController, handler, 'ADMIN')).toBe(true);
        expect(allowed(JobsAdminController, handler, 'COMPANY')).toBe(false);
        expect(allowed(JobsAdminController, handler, 'APPLICANT')).toBe(false);
    });

    it('the company endpoints stay COMPANY only', () => {
        for (const handler of ['upload', 'mine', 'stop', 'reopen', 'roles', 'addRole', 'updateRole', 'removeRole']) {
            expect(allowed(JobsController, handler, 'COMPANY')).toBe(true);
            expect(allowed(JobsController, handler, 'ADMIN')).toBe(false);
            expect(allowed(JobsController, handler, 'APPLICANT')).toBe(false);
        }
    });

    it('serves the routes GET /jobs/admin/pending and PATCH /jobs/admin/:id/approval', () => {
        expect(Reflect.getMetadata('path', JobsAdminController)).toBe('jobs/admin');
        expect(Reflect.getMetadata('path', JobsAdminController.prototype.pending)).toBe('pending');
        expect(Reflect.getMetadata('path', JobsAdminController.prototype.decide)).toBe(':id/approval');
        // 0 = GET, 4 = PATCH in Nest's RequestMethod enum
        expect(Reflect.getMetadata('method', JobsAdminController.prototype.pending)).toBe(0);
        expect(Reflect.getMetadata('method', JobsAdminController.prototype.decide)).toBe(4);
    });

    it('hands the decision to the service', async () => {
        const service = { listPending: jest.fn().mockResolvedValue(['p']), decideApproval: jest.fn().mockResolvedValue({ id: 'p1' }) };
        const ctrl = new JobsAdminController(service as any);

        expect(await ctrl.pending()).toEqual(['p']);
        await ctrl.decide('p1', { approved: true, note: 'ok' });
        expect(service.decideApproval).toHaveBeenCalledWith('p1', { approved: true, note: 'ok' });
    });
});

describe('SetJobApprovalDto', () => {
    const check = async (body: Record<string, unknown>) => validate(plainToInstance(SetJobApprovalDto, body));

    it('accepts approved with or without a note', async () => {
        expect(await check({ approved: true })).toEqual([]);
        expect(await check({ approved: false, note: 'Salary range is missing' })).toEqual([]);
    });

    it('rejects a missing or non-boolean approved and an over-long note', async () => {
        expect((await check({})).length).toBeGreaterThan(0);
        expect((await check({ approved: 'yes' })).length).toBeGreaterThan(0);
        expect((await check({ approved: true, note: 'x'.repeat(501) })).length).toBeGreaterThan(0);
        expect((await check({ approved: true, note: 5 })).length).toBeGreaterThan(0);
    });
});

describe('InternalController (contract section 3, rule 3)', () => {
    it('is protected by InternalKeyGuard', () => {
        expect(Reflect.getMetadata('__guards__', InternalController)).toContain(InternalKeyGuard);
    });

    it('still returns the role with its company', async () => {
        const prisma = { jobRole: { findUnique: jest.fn().mockResolvedValue({ id: 'r1', title: 'Dev', requirements: { a: 1 }, jobPosting: { companyId: 'c1' } }) } };

        expect(await new InternalController(prisma as any).getRole('r1')).toEqual({ id: 'r1', title: 'Dev', companyId: 'c1', requirements: { a: 1 } });
    });
});
