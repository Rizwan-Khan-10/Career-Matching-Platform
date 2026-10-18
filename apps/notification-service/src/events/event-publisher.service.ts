import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { RedisService } from '../redis/redis.service';

export interface NotificationPayload {
  id: string;
  type: string;
  title: string;
  body: string;
  data: unknown;
  readAt: Date | null;
  createdAt: Date;
}

@Injectable()
export class EventPublisher {
  private readonly logger = new Logger(EventPublisher.name);

  constructor(private redis: RedisService) { }

  /** `notification.created` -> websocket-gateway pushes it live. Best effort: the row is already saved. */
  async publishCreated(userId: string, notification: NotificationPayload, requestId?: string): Promise<void> {
    const data = { userId, notification, requestId: requestId ?? randomUUID() };
    try {
      await this.redis.client.xadd('notification.created', 'MAXLEN', '~', 10000, '*', 'data', JSON.stringify(data));
    } catch (err) {
      this.logger.error(`could not publish notification.created: ${(err as Error).message}`);
    }
  }
}
