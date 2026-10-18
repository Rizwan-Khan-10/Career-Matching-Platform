import { Module } from '@nestjs/common';
import { NotificationCleanupService } from '../cleanup/notification-cleanup.service';
import { EventsModule } from '../events/events.module';
import { EmailQueueService } from '../queue/email-queue.service';
import { NotificationsApiService } from './notifications-api.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [EventsModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsApiService, NotificationCleanupService, EmailQueueService],
  exports: [NotificationsService],
})
export class NotificationsModule { }