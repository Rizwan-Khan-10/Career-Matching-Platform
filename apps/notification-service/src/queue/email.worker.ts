import { Injectable, OnModuleInit } from '@nestjs/common';
import { Worker } from 'bullmq';
import { EmailService } from '../email/email.service';
import axios from 'axios';

@Injectable()
export class EmailWorker implements OnModuleInit {
    constructor(private emailService: EmailService) { }

    onModuleInit() {
        new Worker(
            'email-queue',
            async (job) => {
                const email = await this.resolveEmail(job.data.applicantId);
                if (job.name === 'eligibility-result') {
                    await this.emailService.sendEligibilityResult(email, job.data.eligible);
                } else if (job.name === 'feedback-guide') {
                    await this.emailService.sendFeedbackGuide(email, job.data.feedback);
                }
            },
            { connection: { url: process.env.REDIS_URL || 'redis://localhost:6379' } },
        );
    }

    private async resolveEmail(applicantId: string): Promise<string> {
        const res = await axios.get(`${process.env.AUTH_SERVICE_URL}/internal/users/${applicantId}/email`);
        return res.data.email;
    }
}