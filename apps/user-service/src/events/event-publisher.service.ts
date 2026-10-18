import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { RedisService } from '../redis/redis.service';

/** Publishes one event: a single field `data` holding JSON, stream trimmed to ~10000 (contract §3.1, §3.2). */
@Injectable()
export class EventPublisher {
  private readonly logger = new Logger(EventPublisher.name);

  constructor(private redis: RedisService) { }

  async publish(stream: string, payload: Record<string, unknown>): Promise<void> {
    const data = { ...payload, requestId: payload.requestId ?? randomUUID() };
    try {
      await this.redis.client.xadd(stream, 'MAXLEN', '~', 10000, '*', 'data', JSON.stringify(data));
    } catch (err) {
      // The database change is already saved, so the request must not fail because of the event.
      this.logger.error(`could not publish ${stream}: ${(err as Error).message}`);
    }
  }
}