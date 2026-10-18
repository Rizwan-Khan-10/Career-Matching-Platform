import { HttpException } from '@nestjs/common';
import { HealthController } from './health.controller';

const prisma = (ok: boolean) => ({
  $queryRaw: ok ? vi.fn().mockResolvedValue([{ '?column?': 1 }]) : vi.fn().mockRejectedValue(new Error('db down')),
});
const redis = (ok: boolean) => ({
  client: { ping: ok ? vi.fn().mockResolvedValue('PONG') : vi.fn().mockRejectedValue(new Error('redis down')) },
});

describe('HealthController', () => {
  it('returns ok when the database and Redis answer', async () => {
    const controller = new HealthController(prisma(true) as any, redis(true) as any);
    await expect(controller.check()).resolves.toEqual({
      status: 'ok',
      service: 'auth-service',
      checks: { database: true, redis: true },
    });
  });

  it('answers 503 degraded when the database is down', async () => {
    const controller = new HealthController(prisma(false) as any, redis(true) as any);
    const err = await controller.check().catch((e) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(503);
    expect(err.getResponse()).toMatchObject({ status: 'degraded', checks: { database: false, redis: true } });
  });

  it('answers 503 degraded when Redis is down', async () => {
    const controller = new HealthController(prisma(true) as any, redis(false) as any);
    const err = await controller.check().catch((e) => e);
    expect(err.getStatus()).toBe(503);
    expect(err.getResponse()).toMatchObject({ status: 'degraded', checks: { database: true, redis: false } });
  });
});