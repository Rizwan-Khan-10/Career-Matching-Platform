import { Injectable, Logger } from '@nestjs/common';
import { NotificationsService } from '../notifications/notifications.service';
import { EventData, POLICY, str } from '../policy/notification-policy';

@Injectable()
export class NotificationEventsService {
  private readonly logger = new Logger(NotificationEventsService.name);

  constructor(private notifications: NotificationsService) { }

  /** One event in, at most one notification out. Throws only when saving fails (so the consumer retries). */
  async process(stream: string, data: EventData, streamId: string): Promise<void> {
    const rule = POLICY.get(stream);
    if (!rule) {
      this.logger.warn(`${stream} ${streamId}: no policy for this stream`);
      return;
    }

    const plan = rule(data, { stream, streamId });
    if (!plan) {
      this.logger.log(`${stream} ${streamId}: nothing to notify`);
      return;
    }

    const result = await this.notifications.deliver(plan, str(data.requestId));
    this.logger.log(`${stream} ${streamId}: ${plan.type} ${result}`);
  }
}
