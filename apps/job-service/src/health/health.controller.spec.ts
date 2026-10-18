import { HttpException } from '@nestjs/common';
import { HealthController } from './health.controller';

jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('../redis/redis.service', () => ({ RedisService: class {} }));

describe('HealthController', () => {
    const make = (over: { db?: () => Promise<unknown>; redis?: () => Promise<unknown> } = {}) => {
        const prisma = { $queryRaw: over.db ?? (async () => [{ '?column?': 1 }]) };
        const redis = { client: { ping: over.redis ?? (async () => 'PONG') } };
        return new HealthController(prisma as any, redis as any);
    };

    it('answers 200 ok when database and redis are fine', async () => {
        expect(await make().check()).toMatchObject({ status: 'ok', service: 'job-service', checks: { database: true, redis: true } });
    });

    it.each([
        ['the database is down', { db: async () => { throw new Error('down'); } }, { database: false, redis: true }],
        ['redis is down', { redis: async () => { throw new Error('down'); } }, { database: true, redis: false }],
    ])('answers 503 degraded when %s', async (_name, over, checks) => {
        const err: any = await make(over).check().catch((e) => e);

        expect(err).toBeInstanceOf(HttpException);
        expect(err.getStatus()).toBe(503);
        expect(err.getResponse()).toMatchObject({ status: 'degraded', checks });
    });
});
