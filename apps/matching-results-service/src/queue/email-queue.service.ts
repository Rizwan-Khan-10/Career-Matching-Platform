import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';

export interface CandidateReadyEmail {
    companyId: string;
    matchId: string;
    jobRoleId: string;
    roleTitle?: string | null;
    applicantName?: string | null;
    score: number;
}

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

    async enqueueEligibilityEmail(applicantId: string, jobRoleId: string, eligible: boolean) {
        await this.queue.add('eligibility-result', { applicantId, jobRoleId, eligible });
    }

    async enqueueFeedbackEmail(applicantId: string, feedback: string) {
        await this.queue.add('feedback-guide', { applicantId, feedback });
    }

    /** Company is INFORMED (no attachment) that an approved candidate is waiting. jobId = matchId -> never queued twice. */
    async enqueueCandidateReadyEmail(data: CandidateReadyEmail) {
        await this.queue.add('candidate-ready', data, { jobId: `candidate-ready-${data.matchId}` });
    }
}