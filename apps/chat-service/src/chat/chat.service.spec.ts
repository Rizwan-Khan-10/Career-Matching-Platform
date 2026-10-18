import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import axios from 'axios';
import { ChatService } from './chat.service';
import { runWithRequestId } from '../common/request-context';

jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('axios', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));

const post = axios.post as jest.Mock;

describe('ChatService', () => {
    const env = { ...process.env };
    let prisma: any;
    let service: ChatService;

    beforeEach(() => {
        process.env.CHATBOT_AGENT_URL = 'http://agent:8000';
        post.mockReset().mockResolvedValue({ data: { reply: '  Here is my answer.  ' } });
        prisma = {
            chatConversation: { findFirst: jest.fn().mockResolvedValue({ id: 'c1', applicantId: 'a1', jobRoleId: 'r1' }), update: jest.fn() },
            chatMessage: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn() },
            $transaction: jest.fn().mockResolvedValue([{}, { id: 'm2' }, {}]),
        };
        service = new ChatService(prisma);
    });

    afterEach(() => {
        process.env = { ...env };
    });

    it('asks the agent with the user, role, role of the conversation and the requestId, then saves both turns', async () => {
        const out = await runWithRequestId('req-1', () => service.sendMessage('c1', 'a1', 'APPLICANT', 'Am I shortlisted?'));

        const [url, body, options] = post.mock.calls[0];
        expect(url).toBe('http://agent:8000/chat');
        expect(body).toMatchObject({ userId: 'a1', role: 'APPLICANT', message: 'Am I shortlisted?', jobRoleId: 'r1' });
        expect(body.history[body.history.length - 1]).toEqual({ sender: 'user', content: 'Am I shortlisted?' });
        expect(options.headers).toEqual({ 'x-request-id': 'req-1' });
        expect(out).toEqual({ reply: 'Here is my answer.', messageId: 'm2' });
        expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('503 and nothing saved when the agent fails, so "try again" is clean', async () => {
        post.mockRejectedValue(new Error('timeout of 60000ms exceeded'));

        await expect(service.sendMessage('c1', 'a1', 'APPLICANT', 'hi')).rejects.toBeInstanceOf(ServiceUnavailableException);
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('503 when the agent answers with nothing', async () => {
        post.mockResolvedValue({ data: { reply: '   ' } });

        await expect(service.sendMessage('c1', 'a1', 'APPLICANT', 'hi')).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('404 for a conversation that is not the caller\'s, and the agent is never asked', async () => {
        prisma.chatConversation.findFirst.mockResolvedValue(null);

        await expect(service.sendMessage('c1', 'someone-else', 'APPLICANT', 'hi')).rejects.toBeInstanceOf(NotFoundException);
        expect(post).not.toHaveBeenCalled();
        expect(prisma.chatConversation.findFirst).toHaveBeenCalledWith({ where: { id: 'c1', applicantId: 'someone-else' } });
    });

    it('a company\'s quick question goes to the agent as COMPANY without a role or a stored conversation', async () => {
        const out = await service.quickAsk('co1', 'How many candidates?');

        expect(post.mock.calls[0][1]).toEqual({ userId: 'co1', role: 'COMPANY', message: 'How many candidates?' });
        expect(out).toEqual({ reply: 'Here is my answer.' });
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });
});
