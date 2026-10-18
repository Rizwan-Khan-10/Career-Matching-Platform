import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';

const ERROR_LOG_EVERY_MS = 30_000;

/**
 * Shared Redis connection (the rate-limit counters live here so every chat-service instance sees the same numbers).
 * It keeps reconnecting with a short back-off, and a command never waits longer than 1.5 s: if Redis is away the
 * caller gets an error quickly instead of a hanging request.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
    private readonly logger = new Logger(RedisService.name);
    private lastErrorLog = 0;
    public client: Redis;

    constructor() {
        this.client = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
            lazyConnect: true,
            maxRetriesPerRequest: 1,
            commandTimeout: 1500,
            retryStrategy: (attempt) => Math.min(attempt * 200, 2000),
        });
        // without a listener ioredis prints every connection error; log them, but not every 2 seconds
        this.client.on('error', (err) => {
            if (Date.now() - this.lastErrorLog < ERROR_LOG_EVERY_MS) return;
            this.lastErrorLog = Date.now();
            this.logger.warn(`Redis error: ${err.message}`);
        });
        this.client.connect().catch(() => {
            this.logger.warn('Redis not reachable yet.');
        });
    }

    onModuleDestroy() { this.client.disconnect(); }
}
