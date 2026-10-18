import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { CompanyApprovedGuard } from './company-approved.guard';
import { CompanyApprovalService } from './company-approval.service';
import { JobsController } from '../jobs/jobs.controller';

// the generated Prisma client is not needed here (and cannot load outside the real app): mock what jobs.service imports
jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('../redis/redis.service', () => ({ RedisService: class {} }));
jest.mock('../storage/storage.service', () => ({ StorageService: class {} }));
jest.mock('../generated/prisma', () => ({ Prisma: {} }));

const contextFor = (userId: string) =>
    ({ switchToHttp: () => ({ getRequest: () => ({ user: { userId, role: 'COMPANY' } }) }) }) as unknown as ExecutionContext;

describe('CompanyApprovedGuard', () => {
    it('checks the company id taken from the JWT user', async () => {
        const approval = { assertApproved: jest.fn().mockResolvedValue(undefined) };
        const guard = new CompanyApprovedGuard(approval as unknown as CompanyApprovalService);
        await expect(guard.canActivate(contextFor('company-1'))).resolves.toBe(true);
        expect(approval.assertApproved).toHaveBeenCalledWith('company-1');
    });

    it('lets the 403 / 503 of the service reach the client', async () => {
        const approval = { assertApproved: jest.fn().mockRejectedValue(new ForbiddenException('Company is not approved yet')) };
        const guard = new CompanyApprovedGuard(approval as unknown as CompanyApprovalService);
        await expect(guard.canActivate(contextFor('c'))).rejects.toThrow('Company is not approved yet');
    });

    it('is attached to upload and role-create only', () => {
        const guardsOf = (fn: unknown) => (Reflect.getMetadata('__guards__', fn as object) ?? []) as unknown[];
        const proto = JobsController.prototype;
        expect(guardsOf(proto.upload)).toContain(CompanyApprovedGuard);
        expect(guardsOf(proto.addRole)).toContain(CompanyApprovedGuard);
        for (const name of ['mine', 'stop', 'reopen', 'roles', 'updateRole', 'removeRole'] as const) {
            expect(guardsOf(proto[name])).not.toContain(CompanyApprovedGuard);
        }
    });
});
