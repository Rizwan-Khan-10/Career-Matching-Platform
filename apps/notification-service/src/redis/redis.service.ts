import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  public client: Redis;

  constructor() {
    this.client = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      lazyConnect: true,
      // Unlike the other services this one keeps reconnecting: the stream consumer must recover
      // by itself after a Redis restart instead of staying dead until someone restarts the service.
      retryStrategy: (times) => Math.min(times * 200, 3000),
    });
    this.client.connect().catch(() => {
      this.logger.warn('Redis not reachable yet.');
    });
  }

  onModuleDestroy() { this.client.disconnect(); }
}