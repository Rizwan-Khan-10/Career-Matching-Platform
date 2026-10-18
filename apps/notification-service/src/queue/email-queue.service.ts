import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { EmailJob } from '../policy/notification-policy';

@Injectable()
export class EmailQueueService {
  private queue = new Queue('email-queue', {
    connection: { url: process.env.REDIS_URL || 'redis://localhost:6379' },
    // e-mail providers hiccup: retry with back-off instead of silently losing the message
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: 200,
      removeOnFail: 1000,
    },
  });

  async enqueue(job: EmailJob): Promise<void> {
    await this.queue.add(job.name, job.data, job.jobId ? { jobId: job.jobId } : undefined);
  }
}
