import { NotificationCleanupService, readCleanupConfig } from './notification-cleanup.service';

jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('../redis/redis.service', () => ({ RedisService: class {} }));

function build(lock: 'OK' | null = 'OK') {
  const prisma = { notification: { findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn().mockResolvedValue({ count: 0 }) } };
  const redis = { client: { set: jest.fn().mockResolvedValue(lock), eval: jest.fn().mockResolvedValue(1) } };
  return { prisma, redis, service: new NotificationCleanupService(prisma as any, redis as any) };
}

describe('readCleanupConfig', () => {
  it('defaults: enabled, every 24 h, batches of 1000', () => {
    expect(readCleanupConfig({})).toEqual({ enabled: true, intervalMs: 24 * 3600 * 1000, batchSize: 1000 });
  });
  it('reads the env and ignores garbage', () => {
    expect(readCleanupConfig({ CLEANUP_ENABLED: 'false', CLEANUP_INTERVAL_HOURS: '6', CLEANUP_BATCH_SIZE: '50' })).toEqual({ enabled: false, intervalMs: 6 * 3600 * 1000, batchSize: 50 });
    expect(readCleanupConfig({ CLEANUP_INTERVAL_HOURS: 'x', CLEANUP_BATCH_SIZE: '-3' })).toMatchObject({ intervalMs: 24 * 3600 * 1000, batchSize: 1000 });
  });
});

describe('NotificationCleanupService.runOnce', () => {
  const now = new Date('2026-10-18T00:00:00Z');

  it('deletes only rows whose expiresAt is in the past', async () => {
    const { prisma, service } = build();
    prisma.notification.findMany.mockResolvedValueOnce([{ id: 'a' }, { id: 'b' }]);
    prisma.notification.deleteMany.mockResolvedValueOnce({ count: 2 });
    expect(await service.runOnce(now)).toBe(2);
    expect(prisma.notification.findMany.mock.calls[0][0].where).toEqual({ expiresAt: { lt: now } });
    expect(prisma.notification.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['a', 'b'] } } });
  });

  it('works in batches until nothing expired is left', async () => {
    process.env.CLEANUP_BATCH_SIZE = '2';
    try {
      const { prisma, service } = build();
      prisma.notification.findMany
        .mockResolvedValueOnce([{ id: 'a' }, { id: 'b' }])
        .mockResolvedValueOnce([{ id: 'c' }]);
      prisma.notification.deleteMany.mockResolvedValueOnce({ count: 2 }).mockResolvedValueOnce({ count: 1 });
      expect(await service.runOnce(now)).toBe(3);
      expect(prisma.notification.deleteMany).toHaveBeenCalledTimes(2);
    } finally {
      delete process.env.CLEANUP_BATCH_SIZE;
    }
  });

  it('does nothing when there is nothing to delete', async () => {
    const { prisma, service } = build();
    expect(await service.runOnce(now)).toBe(0);
    expect(prisma.notification.deleteMany).not.toHaveBeenCalled();
  });
});

describe('NotificationCleanupService.runScheduled', () => {
  it('skips the run when another instance holds the lock', async () => {
    const { prisma, redis, service } = build(null);
    expect(await service.runScheduled()).toBeNull();
    expect(prisma.notification.findMany).not.toHaveBeenCalled();
    expect(redis.client.eval).not.toHaveBeenCalled();
  });

  it('runs under the lock and releases it', async () => {
    const { redis, service } = build('OK');
    expect(await service.runScheduled()).toBe(0);
    expect(redis.client.set).toHaveBeenCalledWith('notification-service:cleanup-lock', expect.any(String), 'EX', 3600, 'NX');
    expect(redis.client.eval).toHaveBeenCalledTimes(1);
  });

  it('never throws: a database failure is logged, the lock is still released', async () => {
    const { prisma, redis, service } = build('OK');
    prisma.notification.findMany.mockRejectedValue(new Error('db down'));
    await expect(service.runScheduled()).resolves.toBeNull();
    expect(redis.client.eval).toHaveBeenCalledTimes(1);
  });

  it('skips quietly when Redis is down', async () => {
    const { redis, service } = build('OK');
    redis.client.set.mockRejectedValue(new Error('redis down'));
    await expect(service.runScheduled()).resolves.toBeNull();
  });
});