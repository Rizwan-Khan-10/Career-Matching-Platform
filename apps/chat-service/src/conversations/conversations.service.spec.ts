import axios from 'axios';
import { ConversationsService } from './conversations.service';
import { runWithRequestId } from '../common/request-context';

jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('axios', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));

const get = axios.get as jest.Mock;

describe('ConversationsService: calls to other services', () => {
    const env = { ...process.env };
    let prisma: any;
    let service: ConversationsService;

    beforeEach(() => {
        process.env.MATCHING_SERVICE_URL = 'http://matching:3005';
        process.env.JOB_SERVICE_URL = 'http://jobs:3004';
        process.env.INTERNAL_API_KEY = 'secret-key';
        get.mockReset();
        prisma = {
            chatConversation: { findMany: jest.fn().mockResolvedValue([]), createMany: jest.fn().mockResolvedValue({ count: 1 }) },
        };
        service = new ConversationsService(prisma);
    });

    afterEach(() => {
        process.env = { ...env };
    });

    const matches = (data: unknown) => get.mockResolvedValueOnce({ data });

    it('asks matching-service for the matches with the applicant\'s own token and the requestId', async () => {
        matches([{ jobRoleId: 'r1', roleTitle: 'Backend Developer', companyName: 'Acme' }]);

        await runWithRequestId('req-1', () => service.listForApplicant('a1', 'Bearer abc'));

        const [url, options] = get.mock.calls[0];
        expect(url).toBe('http://matching:3005/matches/mine');
        expect(options.headers).toEqual({ Authorization: 'Bearer abc', 'x-request-id': 'req-1' });
        expect(options.headers['x-internal-key']).toBeUndefined(); // the key is for /internal routes only
        expect(options.timeout).toBeGreaterThan(0);
    });

    it('names a conversation from the match when it carries the title (no extra call)', async () => {
        matches([{ jobRoleId: 'r1', roleTitle: 'Backend Developer', companyName: 'Acme' }]);

        await service.listForApplicant('a1', 'Bearer abc');

        expect(get).toHaveBeenCalledTimes(1);
        expect(prisma.chatConversation.createMany.mock.calls[0][0].data[0].name).toBe('Backend Developer — Acme');
    });

    it('asks job-service /internal/roles/:id WITH the internal key when the match has no title', async () => {
        matches([{ jobRoleId: 'r1' }]);
        get.mockResolvedValueOnce({ data: { title: 'Data Engineer' } });

        await runWithRequestId('req-2', () => service.listForApplicant('a1', 'Bearer abc'));

        const [url, options] = get.mock.calls[1];
        expect(url).toBe('http://jobs:3004/internal/roles/r1');
        expect(options.headers['x-internal-key']).toBe('secret-key');
        expect(options.headers['x-request-id']).toBe('req-2');
        expect(options.headers.Authorization).toBeUndefined();
        expect(prisma.chatConversation.createMany.mock.calls[0][0].data[0].name).toBe('Data Engineer');
    });

    it('falls back to "Chat" when job-service cannot name the role (for example it refuses the call)', async () => {
        matches([{ jobRoleId: 'r1' }]);
        get.mockRejectedValueOnce({ response: { status: 401 }, message: 'Unauthorized' });

        await service.listForApplicant('a1', 'Bearer abc');

        expect(prisma.chatConversation.createMany.mock.calls[0][0].data[0].name).toBe('Chat');
    });

    it('still lists the existing conversations when matching-service is down', async () => {
        get.mockRejectedValueOnce(new Error('connect ECONNREFUSED'));

        await expect(service.listForApplicant('a1', 'Bearer abc')).resolves.toBeDefined();
        expect(prisma.chatConversation.createMany).not.toHaveBeenCalled();
    });
});
