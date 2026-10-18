import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { NotificationEventsService } from './notification-events.service';
import { StreamConsumerService } from './stream-consumer.service';

@Module({
  imports: [NotificationsModule],
  providers: [NotificationEventsService, StreamConsumerService],
})
export class QueueModule { }
