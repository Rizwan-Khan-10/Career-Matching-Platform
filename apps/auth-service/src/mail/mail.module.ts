import { Module } from '@nestjs/common';
import { MailQueueService } from './mail-queue.service';

@Module({
  providers: [MailQueueService],
  exports: [MailQueueService],
})
export class MailModule {}