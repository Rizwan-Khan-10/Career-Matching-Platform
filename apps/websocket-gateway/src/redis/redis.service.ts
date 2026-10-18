import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
    private readonly logger = new Logger(RedisService.name);
    public client: Redis;

    constructor() {
        this.client = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
            lazyConnect: true,
            // Keeps reconnecting: the stream consumer must recover by itself after a Redis restart
            // instead of leaving every browser without live events until someone restarts the gateway.
            retryStrategy: (times) => Math.min(times * 200, 3000),
        });
        this.client.connect().catch(() => {
            this.logger.warn('Redis not reachable yet.');
        });
    }

    onModuleDestroy() { this.client.disconnect(); }
}