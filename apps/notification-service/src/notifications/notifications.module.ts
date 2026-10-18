import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { EmailQueueService } from '../queue/email-queue.service';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [EventsModule],
  providers: [NotificationsService, EmailQueueService],
  exports: [NotificationsService],
})
export class NotificationsModule { }
