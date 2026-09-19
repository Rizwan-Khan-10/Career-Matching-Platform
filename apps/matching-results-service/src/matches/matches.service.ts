import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmailQueueService } from '../queue/email-queue.service';

@Injectable()
export class MatchesService {
    constructor(private prisma: PrismaService, private emailQueue: EmailQueueService) { }

    async saveMatchResult(data: { applicantId: string; jobRoleId: string; score: number; eligible: boolean }) {
        const match = await this.prisma.match.create({ data });
        await this.emailQueue.enqueueEligibilityEmail(data.applicantId, data.jobRoleId, data.eligible);
        return match;
    }

    async saveFeedback(data: { applicantId: string; jobRoleId: string; feedback: string }) {
        const match = await this.prisma.match.updateMany({
            where: { applicantId: data.applicantId, jobRoleId: data.jobRoleId },
            data: { feedback: data.feedback },
        });
        await this.emailQueue.enqueueFeedbackEmail(data.applicantId, data.feedback);
        return match;
    }

    getForApplicant(applicantId: string) {
        return this.prisma.match.findMany({ where: { applicantId }, orderBy: { createdAt: 'desc' } });
    }

    getForJobRole(jobRoleId: string) {
        return this.prisma.match.findMany({ where: { jobRoleId, eligible: true } });
    }
}