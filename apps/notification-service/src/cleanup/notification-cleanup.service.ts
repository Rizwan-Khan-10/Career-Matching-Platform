import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

const LOCK_KEY = 'notification-service:cleanup-lock';
const LOCK_TTL_SECONDS = 60 * 60;
const STARTUP_DELAY_MS = 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

const positive = (raw: string | undefined, fallback: number) => {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export function readCleanupConfig(env: Record<string, string | undefined> = process.env) {
  return {
    enabled: env.CLEANUP_ENABLED !== 'false',
    intervalMs: positive(env.CLEANUP_INTERVAL_HOURS, 24) * HOUR_MS,
    batchSize: Math.floor(positive(env.CLEANUP_BATCH_SIZE, 1000)),
  };
}

/**
 * Daily retention job (contract §4.8): every row gets `expiresAt = createdAt + 90 days` when it is written;
 * this job deletes the rows whose `expiresAt` has passed, in batches so one run never holds a long lock.
 */
@Injectable()
export class NotificationCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationCleanupService.name);
  private startTimer?: ReturnType<typeof setTimeout>;
  private intervalTimer?: ReturnType<typeof setInterval>;

  constructor(private prisma: PrismaService, private redis: RedisService) { }

  onModuleInit() {
    const config = readCleanupConfig();
    if (!config.enabled) {
      this.logger.log('Notification cleanup is disabled (CLEANUP_ENABLED=false)');
      return;
    }
    // first run shortly after boot, then every CLEANUP_INTERVAL_HOURS (default 24); every run is idempotent
    this.startTimer = setTimeout(() => {
      void this.runScheduled();
      this.intervalTimer = setInterval(() => void this.runScheduled(), config.intervalMs);
      this.intervalTimer.unref();
    }, STARTUP_DELAY_MS);
    this.startTimer.unref();
  }

  onModuleDestroy() {
    if (this.startTimer) clearTimeout(this.startTimer);
    if (this.intervalTimer) clearInterval(this.intervalTimer);
  }

  /** Timer entry: a Redis lock keeps several instances from cleaning at the same time. Never throws. */
  async runScheduled(): Promise<number | null> {
    const token = randomUUID();
    try {
      const got = await this.redis.client.set(LOCK_KEY, token, 'EX', LOCK_TTL_SECONDS, 'NX');
      if (got !== 'OK') {
        this.logger.log('Cleanup is already running on another instance; skipping');
        return null;
      }
    } catch (err) {
      this.logger.warn(`Could not take the cleanup lock, skipping this run: ${(err as Error).message}`);
      return null;
    }
    try {
      const deleted = await this.runOnce();
      this.logger.log(`Cleanup removed ${deleted} expired notification(s)`);
      return deleted;
    } catch (err) {
      this.logger.error(`Cleanup run failed: ${(err as Error).message}`);
      return null;
    } finally {
      await this.releaseLock(token);
    }
  }

  /** Deletes every notification whose `expiresAt` is in the past. Returns how many rows were removed. */
  async runOnce(now: Date = new Date()): Promise<number> {
    const { batchSize } = readCleanupConfig();
    let total = 0;
    for (;;) {
      const rows = await this.prisma.notification.findMany({
        where: { expiresAt: { lt: now } },
        select: { id: true },
        orderBy: { expiresAt: 'asc' },
        take: batchSize,
      });
      if (rows.length === 0) break;
      const { count } = await this.prisma.notification.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
      total += count;
      if (rows.length < batchSize) break;
    }
    return total;
  }

  /** Only the owner of the lock may release it (our run might have outlived the lock's TTL). */
  private async releaseLock(token: string) {
    try {
      await this.redis.client.eval(
        `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end`,
        1,
        LOCK_KEY,
        token,
      );
    } catch {
      // the lock expires by itself after an hour
    }
  }
}