import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';

@Injectable()
export class MailQueueService {
  private queue = new Queue('email-queue', {
    connection: { url: process.env.REDIS_URL || 'redis://localhost:6379' },
    defaultJobOptions: { attempts: 5, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 100, removeOnFail: 500 },
  });

  async enqueuePasswordReset(email: string, resetToken: string) {
    await this.queue.add('password-reset', { email, resetToken });
  }
}