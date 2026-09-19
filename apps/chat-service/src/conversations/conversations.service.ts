import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import axios from 'axios';

@Injectable()
export class ConversationsService {
    constructor(private prisma: PrismaService) { }

    async listForApplicant(applicantId: string, authHeader: string) {
        const { data: matches } = await axios.get(`${process.env.MATCHING_SERVICE_URL}/matches/mine`, {
            headers: { Authorization: authHeader },
        });

        for (const match of matches) {
            const exists = await this.prisma.chatConversation.findUnique({
                where: { applicantId_jobRoleId: { applicantId, jobRoleId: match.jobRoleId } },
            });
            if (!exists) {
                const name = await this.buildDefaultName(match.jobRoleId);
                await this.prisma.chatConversation.create({
                    data: { applicantId, jobRoleId: match.jobRoleId, name },
                });
            }
        }

        return this.prisma.chatConversation.findMany({
            where: { applicantId },
            orderBy: { updatedAt: 'desc' },
        });
    }

    private async buildDefaultName(jobRoleId: string): Promise<string> {
        try {
            const { data: role } = await axios.get(`${process.env.JOB_SERVICE_URL}/internal/roles/${jobRoleId}`);
            let companyName = 'Company';
            try {
                const { data: company } = await axios.get(
                    `${process.env.USER_SERVICE_URL}/internal/companies/${role.companyId}/name`,
                );
                companyName = company.name || companyName;
            } catch {
                // company lookup failed — fall back to just the role title, not fatal
            }
            return `${role.title} — ${companyName}`;
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
            orderBy: { createdAt: 'asc' },
        });
    }
}