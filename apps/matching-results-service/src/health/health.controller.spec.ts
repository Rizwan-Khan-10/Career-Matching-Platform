import { HttpException } from '@nestjs/common';
import { HealthController } from './health.controller';

jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('../redis/redis.service', () => ({ RedisService: class {} }));
jest.mock('../queue/stream-consumer.service', () => ({ StreamConsumerService: class {} }));

describe('HealthController', () => {
    const make = (over: { db?: () => Promise<unknown>; redis?: () => Promise<unknown>; consumers?: { ok: boolean; stale: string[] } } = {}) => {
        const prisma = { $queryRaw: over.db ?? (async () => [{ '?column?': 1 }]) };
        const redis = { client: { ping: over.redis ?? (async () => 'PONG') } };
        const consumers = { status: () => over.consumers ?? { ok: true, stale: [] } };
        return new HealthController(prisma as any, redis as any, consumers as any);
    };

    it('answers 200 ok when database, redis and the consumers are fine', async () => {
        expect(await make().check()).toMatchObject({ status: 'ok', checks: { database: true, redis: true, consumers: true } });
    });

    it.each([
        ['the database is down', { db: async () => { throw new Error('down'); } }, { database: false, redis: true, consumers: true }],
        ['redis is down', { redis: async () => { throw new Error('down'); } }, { database: true, redis: false, consumers: true }],
        ['a consumer loop died', { consumers: { ok: false, stale: ['prep.ready'] } }, { database: true, redis: true, consumers: false }],
    ])('answers 503 degraded when %s', async (_name, over, checks) => {
        const err: any = await make(over as any).check().catch((e) => e);

        expect(err).toBeInstanceOf(HttpException);
        expect(err.getStatus()).toBe(503);
        expect(err.getResponse()).toMatchObject({ status: 'degraded', checks });
    });
});
