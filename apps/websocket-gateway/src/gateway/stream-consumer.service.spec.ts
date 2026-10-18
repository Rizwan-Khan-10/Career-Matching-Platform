import { EventsGateway } from './events.gateway';
import { GATEWAY_STREAMS } from './gateway-events';
import { GROUP, GatewayStreamConsumerService } from './stream-consumer.service';

class FastConsumer extends GatewayStreamConsumerService {
    protected sleep() { return Promise.resolve(); }
}

function build(call: jest.Mock = jest.fn()) {
    const client = { xack: jest.fn().mockResolvedValue(1), xadd: jest.fn().mockResolvedValue('1-0'), xgroup: jest.fn().mockResolvedValue('OK'), call };
    const gateway = { pushToUser: jest.fn() };
    return { consumer: new FastConsumer({ client } as any, gateway as any), client, gateway };
}

const RAW = '{"applicantId":"a1","matchId":"m1"}';

describe('GatewayStreamConsumerService', () => {
    it('creates the group ws-gateway-group on every stream, starting at "$", and ignores BUSYGROUP', async () => {
        const { consumer, client } = build();
        client.xgroup.mockRejectedValueOnce(new Error('BUSYGROUP Consumer Group name already exists'));
        await consumer.ensureGroups();

        expect(client.xgroup).toHaveBeenCalledTimes(GATEWAY_STREAMS.length);
        expect(client.xgroup).toHaveBeenCalledWith('CREATE', 'notification.created', GROUP, '$', 'MKSTREAM');
        expect(client.xgroup).toHaveBeenCalledWith('CREATE', 'company.status.changed', GROUP, '$', 'MKSTREAM');
        expect(GROUP).toBe('ws-gateway-group');
    });

    it('pushes the event to its recipient and acknowledges it', async () => {
        const { consumer, client, gateway } = build();
        await consumer.handleMessage('prep.ready', '1-0', ['data', RAW]);

        expect(gateway.pushToUser).toHaveBeenCalledWith('a1', 'prep.ready', { applicantId: 'a1', matchId: 'm1' });
        expect(client.xack).toHaveBeenCalledWith('prep.ready', GROUP, '1-0');
        expect(client.xadd).not.toHaveBeenCalled();
    });

    it.each([
        ['candidate.shortlisted', { applicantId: 'a1', companyId: 'c1' }, 'a1'],
        ['rejection-feedback.ready', { applicantId: 'a1', feedback: null }, 'a1'],
        ['company.status.changed', { companyId: 'c1', status: 'approved' }, 'c1'],
        ['job.approval.changed', { companyId: 'c1', jobPostingId: 'j1', status: 'rejected', note: 'x' }, 'c1'],
        ['notification.created', { userId: 'u1', notification: { id: 'n1' } }, 'u1'],
    ])('%s goes to the right user', async (stream: string, payload: object, expected: string) => {
        const { consumer, gateway } = build();
        await consumer.handleMessage(stream, '1-0', ['data', JSON.stringify(payload)]);
        expect(gateway.pushToUser).toHaveBeenCalledWith(expected, stream, payload);
    });

    it('does not send the internal rejection reason to the applicant', async () => {
        const { consumer, gateway } = build();
        await consumer.handleMessage('candidate.rejected', '1-0', ['data', '{"applicantId":"a1","reasonCategory":"skills_gap","message":"hi"}']);
        expect(gateway.pushToUser).toHaveBeenCalledWith('a1', 'candidate.rejected', { applicantId: 'a1', message: 'hi' });
    });

    it('retries three times, then writes <stream>.dead (with MAXLEN) and acknowledges', async () => {
        const { consumer, client, gateway } = build();
        gateway.pushToUser.mockImplementation(() => {
            throw new Error('boom');
        });
        await consumer.handleMessage('prep.ready', '1-0', ['data', RAW]);

        expect(gateway.pushToUser).toHaveBeenCalledTimes(3);
        expect(client.xadd).toHaveBeenCalledWith('prep.ready.dead', 'MAXLEN', '~', 10000, '*', 'origId', '1-0', 'error', 'boom', 'data', RAW);
        expect(client.xack).toHaveBeenCalledWith('prep.ready', GROUP, '1-0');
    });

    it('succeeds when a later attempt works', async () => {
        const { consumer, client, gateway } = build();
        gateway.pushToUser
            .mockImplementationOnce(() => {
                throw new Error('server not ready');
            })
            .mockImplementation(() => undefined);
        await consumer.handleMessage('prep.ready', '1-0', ['data', RAW]);

        expect(gateway.pushToUser).toHaveBeenCalledTimes(2);
        expect(client.xadd).not.toHaveBeenCalled();
        expect(client.xack).toHaveBeenCalledTimes(1);
    });

    it('dead-letters at once, without retries, a payload that cannot be delivered', async () => {
        const { consumer, client, gateway } = build();
        await consumer.handleMessage('prep.ready', '1-0', ['data', 'not json']);
        await consumer.handleMessage('prep.ready', '2-0', ['data', '[1,2]']);
        await consumer.handleMessage('prep.ready', '3-0', ['other', 'x']);
        await consumer.handleMessage('prep.ready', '4-0', ['data', '{"matchId":"m1"}']); // nobody to send it to

        expect(gateway.pushToUser).not.toHaveBeenCalled();
        expect(client.xadd).toHaveBeenCalledTimes(4);
        expect(client.xack).toHaveBeenCalledTimes(4);
        expect(client.xadd).toHaveBeenLastCalledWith(
            'prep.ready.dead', 'MAXLEN', '~', 10000, '*', 'origId', '4-0', 'error', 'no applicantId, companyId or userId in the payload', 'data', '{"matchId":"m1"}',
        );
    });

    it('keeps the message pending when the dead-letter write itself fails', async () => {
        const { consumer, client, gateway } = build();
        gateway.pushToUser.mockImplementation(() => {
            throw new Error('boom');
        });
        client.xadd.mockRejectedValue(new Error('redis down'));
        await expect(consumer.handleMessage('prep.ready', '1-0', ['data', RAW])).rejects.toThrow('redis down');
        expect(client.xack).not.toHaveBeenCalled();
    });

    it('does not push the event again when only the XACK fails', async () => {
        const { consumer, client, gateway } = build();
        client.xack.mockRejectedValue(new Error('redis down'));
        await expect(consumer.handleMessage('prep.ready', '1-0', ['data', RAW])).rejects.toThrow('redis down');
        expect(gateway.pushToUser).toHaveBeenCalledTimes(1);
        expect(client.xadd).not.toHaveBeenCalled();
    });

    describe('reclaimIdle (XAUTOCLAIM)', () => {
        const callFor = (claimed: unknown[], deliveries = 2) =>
            jest.fn(async (command: string, stream: string) => {
                if (command === 'XAUTOCLAIM') return ['0-0', stream === 'prep.ready' ? claimed : []];
                if (command === 'XPENDING') return [['9-0', 'consumer-1', 70000, deliveries]];
                return null;
            });

        it('claims idle messages of every stream and processes them again', async () => {
            const call = callFor([['9-0', ['data', RAW]]]);
            const { consumer, client, gateway } = build(call);
            await consumer.reclaimIdle();

            expect(call).toHaveBeenCalledWith('XAUTOCLAIM', 'prep.ready', GROUP, 'consumer-1', 60000, '0-0', 'COUNT', 10);
            expect(call.mock.calls.filter(([c]: [string, ...unknown[]]) => c === 'XAUTOCLAIM')).toHaveLength(GATEWAY_STREAMS.length);
            expect(gateway.pushToUser).toHaveBeenCalledWith('a1', 'prep.ready', { applicantId: 'a1', matchId: 'm1' });
            expect(client.xack).toHaveBeenCalledWith('prep.ready', GROUP, '9-0');
        });

        it('dead-letters a message that has been delivered too often', async () => {
            const { consumer, client, gateway } = build(callFor([['9-0', ['data', RAW]]], 6));
            await consumer.reclaimIdle();

            expect(gateway.pushToUser).not.toHaveBeenCalled();
            expect(client.xadd).toHaveBeenCalledWith('prep.ready.dead', 'MAXLEN', '~', 10000, '*', 'origId', '9-0', 'error', 'too many delivery attempts', 'data', RAW);
        });

        it('acknowledges an entry that was trimmed away', async () => {
            const { consumer, client, gateway } = build(callFor([['9-0', null]]));
            await consumer.reclaimIdle();
            expect(gateway.pushToUser).not.toHaveBeenCalled();
            expect(client.xack).toHaveBeenCalledWith('prep.ready', GROUP, '9-0');
        });

        it('carries on with the other streams when one of them cannot be claimed', async () => {
            const call = jest.fn(async (_c: string, stream: string) => {
                if (stream === 'jd.extracted') throw new Error('boom');
                return ['0-0', []];
            });
            const { consumer } = build(call);
            await expect(consumer.reclaimIdle()).resolves.toBeUndefined();
            expect(call).toHaveBeenCalledTimes(GATEWAY_STREAMS.length);
        });
    });
});

/**
 * Socket-level check of the done-criterion: "notification.created reaches the right user". The real EventsGateway runs
 * against a tiny in-memory stand-in for the socket.io server (rooms + emit), with two users connected.
 */
describe('notification.created reaches the right user', () => {
    function world() {
        const rooms = new Map<string, { id: string; received: [string, unknown][] }[]>();
        const server = {
            to: (room: string) => ({
                emit: (event: string, data: unknown) => (rooms.get(room) ?? []).forEach((s) => s.received.push([event, data])),
            }),
        };
        const jwt = { verify: (token: string) => ({ sub: token.replace('token-', '') }) };
        const gateway = new EventsGateway(jwt as any);
        (gateway as any).server = server;

        const connect = (userId: string) => {
            const socket = { id: `socket-${userId}-${Math.random()}`, received: [] as [string, unknown][] };
            gateway.handleConnection({
                handshake: { auth: { token: `token-${userId}` }, query: {} },
                join: (room: string) => rooms.set(room, [...(rooms.get(room) ?? []), socket]),
                disconnect: jest.fn(),
            } as any);
            return socket;
        };

        const client = { xack: jest.fn().mockResolvedValue(1), xadd: jest.fn(), xgroup: jest.fn(), call: jest.fn() };
        return { connect, consumer: new FastConsumer({ client } as any, gateway) };
    }

    it('delivers it to every tab of the owner and to nobody else', async () => {
        const { connect, consumer } = world();
        const ownerTab1 = connect('u1');
        const ownerTab2 = connect('u1');
        const other = connect('u2');
        const notification = { id: 'n1', type: 'resume_ready', title: 'Review and confirm your resume', body: '', data: null, readAt: null, createdAt: '2026-10-18T00:00:00Z' };
        const payload = { userId: 'u1', notification, requestId: 'r-1' };

        await consumer.handleMessage('notification.created', '1-0', ['data', JSON.stringify(payload)]);

        expect(ownerTab1.received).toEqual([['notification.created', payload]]);
        expect(ownerTab2.received).toEqual([['notification.created', payload]]);
        expect(other.received).toEqual([]);
    });

    it('delivers a company event to the company and a shortlist to the applicant, not to the company', async () => {
        const { connect, consumer } = world();
        const applicant = connect('a1');
        const company = connect('c1');

        await consumer.handleMessage('candidate.shortlisted', '1-0', ['data', JSON.stringify({ applicantId: 'a1', companyId: 'c1', matchId: 'm1' })]);
        await consumer.handleMessage('job.approval.changed', '2-0', ['data', JSON.stringify({ companyId: 'c1', jobPostingId: 'j1', status: 'approved' })]);

        expect(applicant.received.map(([e]) => e)).toEqual(['candidate.shortlisted']);
        expect(company.received.map(([e]) => e)).toEqual(['job.approval.changed']);
    });
});