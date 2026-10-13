import { Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import axios from 'axios';

const MAX_HISTORY = 20;          // turns sent to the model (the agent caps again)
const AGENT_TIMEOUT_MS = 60_000; // Groq may retry with back-off; never hang the request forever

@Injectable()
export class ChatService {
    private readonly logger = new Logger(ChatService.name);

    constructor(private prisma: PrismaService) { }

    /** One place that talks to chatbot-agent. Any failure / empty answer -> 503 with a friendly message (never a raw 500). */
    private async askAgent(body: Record<string, unknown>): Promise<string> {
        try {
            const res = await axios.post(`${process.env.CHATBOT_AGENT_URL}/chat`, body, { timeout: AGENT_TIMEOUT_MS });
            const reply = res.data?.reply;
            if (typeof reply !== 'string' || !reply.trim()) throw new Error('empty reply from chatbot-agent');
            return reply.trim();
        } catch (err) {
            this.logger.error(`chatbot-agent call failed: ${(err as Error).message}`);
            throw new ServiceUnavailableException('The assistant is unavailable right now, please try again in a moment.');
        }
    }

    async sendMessage(conversationId: string, applicantId: string, role: string, message: string) {
        const convo = await this.prisma.chatConversation.findFirst({ where: { id: conversationId, applicantId } });
        if (!convo) throw new NotFoundException('Conversation not found');

        const prior = await this.prisma.chatMessage.findMany({
            where: { conversationId },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: MAX_HISTORY - 1,
        });
        const history = [
            ...prior.reverse().map((m) => ({ sender: m.sender, content: m.content })),
            { sender: 'user', content: message },
        ];

        const askedAt = new Date();
        const reply = await this.askAgent({ userId: applicantId, role, message, jobRoleId: convo.jobRoleId, history });

        // Save both turns only AFTER the agent answered: a failed call leaves no orphan question behind, so "try again" is clean.
        // Explicit timestamps: inside one transaction now() is identical for every row and the order would be ambiguous.
        const [, agentMsg] = await this.prisma.$transaction([
            this.prisma.chatMessage.create({ data: { conversationId, sender: 'user', content: message, createdAt: askedAt } }),
            this.prisma.chatMessage.create({
                data: { conversationId, sender: 'agent', content: reply, createdAt: new Date(Math.max(Date.now(), askedAt.getTime() + 1)) },
            }),
            this.prisma.chatConversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } }),
        ]);
        return { reply, messageId: agentMsg.id };
    }

    async quickAsk(companyId: string, message: string) {
        const reply = await this.askAgent({ userId: companyId, role: 'COMPANY', message });
        return { reply };
    }
}