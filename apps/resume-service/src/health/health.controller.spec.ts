import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';

function setup(dbOk = true, redisOk = true) {
    const prisma = { $queryRaw: jest.fn().mockImplementation(() => (dbOk ? Promise.resolve([{ '?column?': 1 }]) : Promise.reject(new Error('db down')))) };
    const redis = { client: { ping: jest.fn().mockImplementation(() => (redisOk ? Promise.resolve('PONG') : Promise.reject(new Error('closed')))) } };
    return new HealthController(prisma as any, redis as any);
}

describe('HealthController', () => {
    it('returns ok when the database and Redis answer', async () => {
        await expect(setup().check()).resolves.toEqual({ status: 'ok' });
    });

    it('answers 503 degraded when the database is down', async () => {
        const err = await setup(false, true).check().catch((e) => e);
        expect(err).toBeInstanceOf(ServiceUnavailableException);
        expect(err.getResponse()).toMatchObject({ status: 'degraded', db: 'down', redis: 'ok' });
    });

    it('answers 503 degraded when Redis is down', async () => {
        const err = await setup(true, false).check().catch((e) => e);
        expect(err).toBeInstanceOf(ServiceUnavailableException);
        expect(err.getResponse()).toMatchObject({ status: 'degraded', db: 'ok', redis: 'down' });
    });
});