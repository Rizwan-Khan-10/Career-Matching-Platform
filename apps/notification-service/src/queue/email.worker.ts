import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Worker } from 'bullmq';
import axios from 'axios';
import { EmailService } from '../email/email.service';

@Injectable()
export class EmailWorker implements OnModuleInit {
    private readonly logger = new Logger(EmailWorker.name);

    constructor(private emailService: EmailService) { }

    onModuleInit() {
        const worker = new Worker(
            'email-queue',
            async (job) => {
                // each job type names its own recipient (applicant for most, company for 'candidate-ready')
                if (job.name === 'eligibility-result') {
                    const email = await this.resolveEmail(job.data.applicantId);
                    await this.emailService.sendEligibilityResult(email, job.data.eligible);
                } else if (job.name === 'feedback-guide') {
                    const email = await this.resolveEmail(job.data.applicantId);
                    await this.emailService.sendFeedbackGuide(email, job.data.feedback);
                } else if (job.name === 'candidate-ready') {
                    const email = await this.resolveEmail(job.data.companyId);
                    await this.emailService.sendCandidateReady(email, {
                        applicantName: job.data.applicantName,
                        roleTitle: job.data.roleTitle,
                        score: job.data.score,
                        jobRoleId: job.data.jobRoleId,
                    });
                } else {
                    this.logger.warn(`unknown email job "${job.name}"`);
                }
            },
            { connection: { url: process.env.REDIS_URL || 'redis://localhost:6379' } },
        );
        worker.on('failed', (job, err) => this.logger.error(`email job ${job?.name}#${job?.id} failed (attempt ${job?.attemptsMade}): ${err.message}`));
    }

    private async resolveEmail(userId: string): Promise<string> {
        const res = await axios.get(`${process.env.AUTH_SERVICE_URL}/internal/users/${userId}/email`);
        return res.data.email;
    }
}