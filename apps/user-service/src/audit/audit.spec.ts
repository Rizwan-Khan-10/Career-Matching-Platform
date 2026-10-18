import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AuditService } from './audit.service';
import { CreateAuditDto } from './dto/create-audit.dto';
import { ListAuditDto } from './dto/list-audit.dto';
import { InternalAuditController } from '../internal/internal-audit.controller';

function build() {
    const prisma = {
        auditLog: {
            create: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'a1', ...data })),
            findMany: jest.fn().mockResolvedValue([]),
        },
    };
    return { service: new AuditService(prisma as any), prisma };
}

describe('AuditService', () => {
    it('writes an audit entry', async () => {
        const { service, prisma } = build();
        await service.record({ actorId: 'admin-1', action: 'user.deleted', target: 'u2', meta: { role: 'APPLICANT' } });
        expect(prisma.auditLog.create).toHaveBeenCalledWith({
            data: { actorId: 'admin-1', action: 'user.deleted', target: 'u2', meta: { role: 'APPLICANT' } },
        });
    });

    it('lists newest first with the given limit (default 50)', async () => {
        const { service, prisma } = build();
        await service.list();
        await service.list(10);
        expect(prisma.auditLog.findMany).toHaveBeenNthCalledWith(1, { orderBy: { createdAt: 'desc' }, take: 50 });
        expect(prisma.auditLog.findMany).toHaveBeenNthCalledWith(2, { orderBy: { createdAt: 'desc' }, take: 10 });
    });
});

describe('InternalAuditController (POST /internal/audit)', () => {
    it('stores the entry and returns its id', async () => {
        const { service, prisma } = build();
        const controller = new InternalAuditController(service);
        await expect(controller.create({ actorId: 'admin-1', action: 'settings.updated', target: 'settings' })).resolves.toEqual({ id: 'a1' });
        expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
    });
});

describe('audit DTOs', () => {
    it('accepts a valid entry with and without meta', async () => {
        expect(await validate(plainToInstance(CreateAuditDto, { actorId: 'a', action: 'x', target: 't' }))).toEqual([]);
        expect(await validate(plainToInstance(CreateAuditDto, { actorId: 'a', action: 'x', target: 't', meta: { n: 1 } }))).toEqual([]);
    });

    it('rejects missing fields and a meta that is not an object', async () => {
        expect((await validate(plainToInstance(CreateAuditDto, { actorId: 'a', action: 'x' }))).length).toBeGreaterThan(0);
        expect((await validate(plainToInstance(CreateAuditDto, { actorId: 'a', action: 'x', target: 't', meta: 'text' }))).length).toBeGreaterThan(0);
    });

    it('limit is optional, a number from the query string, between 1 and 200', async () => {
        expect(await validate(plainToInstance(ListAuditDto, {}))).toEqual([]);
        expect(plainToInstance(ListAuditDto, { limit: '25' }).limit).toBe(25);
        expect((await validate(plainToInstance(ListAuditDto, { limit: '0' }))).length).toBeGreaterThan(0);
        expect((await validate(plainToInstance(ListAuditDto, { limit: '201' }))).length).toBeGreaterThan(0);
        expect((await validate(plainToInstance(ListAuditDto, { limit: 'abc' }))).length).toBeGreaterThan(0);
    });
});