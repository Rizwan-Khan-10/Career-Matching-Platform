import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
    public client: Redis;

    constructor() {
        this.client = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
            lazyConnect: true,
            retryStrategy: () => null,
        });
        this.client.connect().catch(() => {
            console.warn('Redis not reachable yet.');
        });
    }

    onModuleDestroy() { this.client.disconnect(); }
}