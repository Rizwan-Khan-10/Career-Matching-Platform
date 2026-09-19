import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';

@Injectable()
export class EmailQueueService {
    private queue = new Queue('email-queue', {
        connection: { url: process.env.REDIS_URL || 'redis://localhost:6379' },
    });

    async enqueueEligibilityEmail(applicantId: string, jobRoleId: string, eligible: boolean) {
        await this.queue.add('eligibility-result', { applicantId, jobRoleId, eligible });
    }

    async enqueueFeedbackEmail(applicantId: string, feedback: string) {
        await this.queue.add('feedback-guide', { applicantId, feedback });
    }
}