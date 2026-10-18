import { NotFoundException } from '@nestjs/common';
import { AdminService } from './admin.service';

function build(company: Record<string, unknown> | null = { userId: 'c1', name: 'Acme', status: 'pending' }) {
    const prisma = {
        companyProfile: {
            findUnique: jest.fn().mockResolvedValue(company),
            findMany: jest.fn().mockResolvedValue(company ? [company] : []),
            update: jest.fn().mockImplementation(async ({ data }: any) => ({ ...company, ...data })),
        },
        applicantProfile: { findMany: jest.fn().mockResolvedValue([]) },
        auditLog: { create: jest.fn().mockResolvedValue({ id: 'a1' }) },
        $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
        $queryRaw: jest.fn().mockResolvedValue([]),
    };
    const events = { publish: jest.fn().mockResolvedValue(undefined) };
    return { service: new AdminService(prisma as any, events as any), prisma, events };
}

describe('AdminService.setCompanyStatus', () => {
    it('saves the status and the audit entry together, then publishes company.status.changed', async () => {
        const { service, prisma, events } = build();
        const result = await service.setCompanyStatus('admin-1', 'c1', 'approved');

        expect(result).toMatchObject({ userId: 'c1', status: 'approved' });
        expect(prisma.$transaction).toHaveBeenCalledTimes(1);
        expect(prisma.companyProfile.update).toHaveBeenCalledWith({ where: { userId: 'c1' }, data: { status: 'approved' } });
        expect(prisma.auditLog.create).toHaveBeenCalledWith({
            data: { actorId: 'admin-1', action: 'company.status.changed', target: 'c1', meta: { from: 'pending', to: 'approved' } },
        });
        expect(events.publish).toHaveBeenCalledWith('company.status.changed', { companyId: 'c1', status: 'approved' });
    });

    it('publishes the event only after the transaction is saved', async () => {
        const { service, prisma, events } = build();
        await service.setCompanyStatus('admin-1', 'c1', 'rejected');
        expect(prisma.$transaction.mock.invocationCallOrder[0]).toBeLessThan(events.publish.mock.invocationCallOrder[0]);
    });

    it('does nothing (no event, no audit) when the status is already that value', async () => {
        const { service, prisma, events } = build({ userId: 'c1', status: 'approved' });
        await service.setCompanyStatus('admin-1', 'c1', 'approved');

        expect(prisma.$transaction).not.toHaveBeenCalled();
        expect(events.publish).not.toHaveBeenCalled();
    });

    it('does not publish when saving fails', async () => {
        const { service, prisma, events } = build();
        prisma.$transaction.mockRejectedValueOnce(new Error('db down'));
        await expect(service.setCompanyStatus('admin-1', 'c1', 'approved')).rejects.toThrow('db down');
        expect(events.publish).not.toHaveBeenCalled();
    });

    it('answers 404 for an unknown company', async () => {
        const { service, events } = build(null);
        await expect(service.setCompanyStatus('admin-1', 'nope', 'approved')).rejects.toBeInstanceOf(NotFoundException);
        expect(events.publish).not.toHaveBeenCalled();
    });
});

describe('AdminService lists', () => {
    it('adds email and isActive from the auth_service accounts', async () => {
        const { service, prisma } = build();
        prisma.$queryRaw.mockResolvedValue([{ id: 'c1', email: 'hr@acme.com', isActive: true }]);

        const [item] = await service.listCompanies();

        expect(item).toMatchObject({ userId: 'c1', status: 'pending', email: 'hr@acme.com', isActive: true });
    });

    it('keeps applicant academic fields and adds the account info', async () => {
        const { service, prisma } = build();
        prisma.applicantProfile.findMany.mockResolvedValue([
            { userId: 'u1', cgpa: 8.1, branch: 'CSE', passingYear: 2026, backlogs: 0, academicVerified: true },
        ]);
        prisma.$queryRaw.mockResolvedValue([{ id: 'u1', email: 'a@college.edu', isActive: false }]);

        const [item] = await service.listApplicants();

        expect(item).toMatchObject({ cgpa: 8.1, academicVerified: true, email: 'a@college.edu', isActive: false });
    });

    it('gives nulls when the account no longer exists', async () => {
        const { service } = build();
        const [item] = await service.listCompanies();
        expect(item).toMatchObject({ email: null, isActive: null });
    });

    it('skips the account query for an empty list', async () => {
        const { service, prisma } = build(null);
        await expect(service.listCompanies()).resolves.toEqual([]);
        expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });
});