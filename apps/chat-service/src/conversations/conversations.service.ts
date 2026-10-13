import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import axios from 'axios';

interface MatchSummary {
    jobRoleId: string;
    roleTitle?: string | null;
    companyName?: string | null;
}

@Injectable()
export class ConversationsService {
    private readonly logger = new Logger(ConversationsService.name);

    constructor(private prisma: PrismaService) { }

    async listForApplicant(applicantId: string, authHeader: string) {
        // One conversation per match. If matching-service is down we still show the conversations that already exist.
        let matches: MatchSummary[] = [];
        try {
            const res = await axios.get(`${process.env.MATCHING_SERVICE_URL}/matches/mine`, {
                headers: { Authorization: authHeader },
                timeout: 10_000,
            });
            matches = Array.isArray(res.data) ? res.data : [];
        } catch (err) {
            this.logger.warn(`matching-service unavailable, listing existing conversations only: ${(err as Error).message}`);
        }

        const existing = await this.prisma.chatConversation.findMany({ where: { applicantId }, select: { jobRoleId: true } });
        const have = new Set(existing.map((c) => c.jobRoleId));
        const missing = new Map<string, MatchSummary>();
        for (const m of matches) if (m?.jobRoleId && !have.has(m.jobRoleId)) missing.set(m.jobRoleId, m);

        if (missing.size > 0) {
            const data = await Promise.all(
                [...missing.values()].map(async (m) => ({ applicantId, jobRoleId: m.jobRoleId, name: await this.buildDefaultName(m) })),
            );
            // skipDuplicates: two parallel list calls (or a double render) must not crash on the unique (applicantId, jobRoleId)
            await this.prisma.chatConversation.createMany({ data, skipDuplicates: true });
        }

        return this.prisma.chatConversation.findMany({ where: { applicantId }, orderBy: { updatedAt: 'desc' } });
    }

    /** matching-service already returns roleTitle + companyName for each match: no extra service calls needed. */
    private async buildDefaultName(m: MatchSummary): Promise<string> {
        if (m.roleTitle) return `${m.roleTitle} — ${m.companyName || 'Company'}`;
        try {
            const { data: role } = await axios.get(`${process.env.JOB_SERVICE_URL}/internal/roles/${m.jobRoleId}`, { timeout: 5_000 });
            return role?.title ? String(role.title) : 'Chat';
        } catch {
            return 'Chat';
        }
    }

    async rename(conversationId: string, applicantId: string, name: string) {
        const convo = await this.prisma.chatConversation.findFirst({ where: { id: conversationId, applicantId } });
        if (!convo) throw new NotFoundException('Conversation not found');
        return this.prisma.chatConversation.update({ where: { id: conversationId }, data: { name } });
    }

    async getMessages(conversationId: string, applicantId: string) {
        const convo = await this.prisma.chatConversation.findFirst({ where: { id: conversationId, applicantId } });
        if (!convo) throw new NotFoundException('Conversation not found');
        return this.prisma.chatMessage.findMany({
            where: { conversationId },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        });
    }
}