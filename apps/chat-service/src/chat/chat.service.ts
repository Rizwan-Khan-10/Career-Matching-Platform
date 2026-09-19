import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import axios from 'axios';

@Injectable()
export class ChatService {
    constructor(private prisma: PrismaService) { }

    async sendMessage(conversationId: string, applicantId: string, role: string, message: string) {
        const convo = await this.prisma.chatConversation.findFirst({ where: { id: conversationId, applicantId } });
        if (!convo) throw new NotFoundException('Conversation not found');

        await this.prisma.chatMessage.create({ data: { conversationId, sender: 'user', content: message } });

        const priorMessages = await this.prisma.chatMessage.findMany({
            where: { conversationId },
            orderBy: { createdAt: 'asc' },
        });
        const history = priorMessages.map((m) => ({ sender: m.sender, content: m.content }));

        const res = await axios.post(`${process.env.CHATBOT_AGENT_URL}/chat`, {
            userId: applicantId,
            role,
            message,
            jobRoleId: convo.jobRoleId,
            history,
        });

        await this.prisma.chatMessage.create({ data: { conversationId, sender: 'agent', content: res.data.reply } });
        await this.prisma.chatConversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });

        return { reply: res.data.reply };
    }

    async quickAsk(companyId: string, message: string) {
        const res = await axios.post(`${process.env.CHATBOT_AGENT_URL}/chat`, {
            userId: companyId,
            role: 'COMPANY',
            message,
        });
        return res.data;
    }
}