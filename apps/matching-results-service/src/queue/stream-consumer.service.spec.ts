import { StreamConsumerService } from './stream-consumer.service';
import { currentRequestId } from '../common/request-context';

jest.mock('../redis/redis.service', () => ({ RedisService: class {} }));
jest.mock('../matches/matches.service', () => ({ MatchesService: class {} }));

describe('StreamConsumerService (contract section 3, rule 4)', () => {
    let client: any;
    let service: StreamConsumerService;
    const json = (o: unknown) => JSON.stringify(o);

    beforeEach(() => {
        client = { xack: jest.fn().mockResolvedValue(1), xadd: jest.fn().mockResolvedValue('1-0'), xautoclaim: jest.fn(), xgroup: jest.fn() };
        service = new StreamConsumerService({ client } as any, {} as any);
        (service as any).backoffMs = () => 0;
    });

    describe('handleWithRetry', () => {
        it('acknowledges after the handler succeeded', async () => {
            const handler = jest.fn().mockResolvedValue(undefined);

            await service.handleWithRetry('s', 'g', '1-0', ['data', json({ a: 1 })], handler);

            expect(handler).toHaveBeenCalledWith({ a: 1 });
            expect(client.xack).toHaveBeenCalledWith('s', 'g', '1-0');
            expect(client.xadd).not.toHaveBeenCalled();
        });

        it('retries a failing handler and acknowledges once it works', async () => {
            const handler = jest.fn().mockRejectedValueOnce(new Error('db blip')).mockResolvedValue(undefined);

            await service.handleWithRetry('s', 'g', '1-0', ['data', json({ a: 1 })], handler);

            expect(handler).toHaveBeenCalledTimes(2);
            expect(client.xadd).not.toHaveBeenCalled();
            expect(client.xack).toHaveBeenCalledTimes(1);
        });

        it('dead-letters after 3 attempts (trimmed with MAXLEN) and still acknowledges', async () => {
            const handler = jest.fn().mockRejectedValue(new Error('always broken'));
            const raw = json({ a: 1 });

            await service.handleWithRetry('s', 'g', '1-0', ['data', raw], handler);

            expect(handler).toHaveBeenCalledTimes(3);
            expect(client.xadd).toHaveBeenCalledWith('s.dead', 'MAXLEN', '~', 10000, '*', 'origId', '1-0', 'error', 'always broken', 'data', raw);
            expect(client.xack).toHaveBeenCalledWith('s', 'g', '1-0');
        });

        it('dead-letters a payload that is not JSON without calling the handler', async () => {
            const handler = jest.fn();

            await service.handleWithRetry('s', 'g', '1-0', ['data', '{not json'], handler);

            expect(handler).not.toHaveBeenCalled();
            expect(client.xadd.mock.calls[0][0]).toBe('s.dead');
            expect(client.xack).toHaveBeenCalledWith('s', 'g', '1-0');
        });

        it('runs the handler with the requestId of the event (or a new one)', async () => {
            const seen: (string | undefined)[] = [];
            const handler = jest.fn().mockImplementation(async () => { seen.push(currentRequestId()); });

            await service.handleWithRetry('s', 'g', '1-0', ['data', json({ requestId: 'req-9' })], handler);
            await service.handleWithRetry('s', 'g', '2-0', ['data', json({})], handler);

            expect(seen[0]).toBe('req-9');
            expect(seen[1]).toEqual(expect.any(String));
            expect(seen[1]).not.toBe('req-9');
        });
    });

    describe('reclaimIdle (XAUTOCLAIM)', () => {
        it('takes over idle pending messages, handles them and acknowledges', async () => {
            client.xautoclaim.mockResolvedValueOnce(['0-0', [['5-0', ['data', json({ a: 5 })]]]]);
            const handler = jest.fn().mockResolvedValue(undefined);

            await service.reclaimIdle('s', 'g', 'consumer-s', handler);

            expect(client.xautoclaim).toHaveBeenCalledWith('s', 'g', 'consumer-s', 60000, '0-0', 'COUNT', 10);
            expect(handler).toHaveBeenCalledWith({ a: 5 });
            expect(client.xack).toHaveBeenCalledWith('s', 'g', '5-0');
        });

        it('follows the cursor until Redis says the scan is complete', async () => {
            client.xautoclaim
                .mockResolvedValueOnce(['6-0', [['5-0', ['data', json({ n: 1 })]]]])
                .mockResolvedValueOnce(['0-0', [['6-0', ['data', json({ n: 2 })]]]]);
            const handler = jest.fn().mockResolvedValue(undefined);

            await service.reclaimIdle('s', 'g', 'c', handler);

            expect(client.xautoclaim).toHaveBeenCalledTimes(2);
            expect(client.xautoclaim.mock.calls[1][4]).toBe('6-0');
            expect(handler).toHaveBeenCalledTimes(2);
        });

        it('only acknowledges an entry that was trimmed away while pending', async () => {
            client.xautoclaim.mockResolvedValueOnce(['0-0', [['7-0', null]]]);
            const handler = jest.fn();

            await service.reclaimIdle('s', 'g', 'c', handler);

            expect(handler).not.toHaveBeenCalled();
            expect(client.xack).toHaveBeenCalledWith('s', 'g', '7-0');
        });

        it('sends a reclaimed message that keeps failing to the dead-letter stream', async () => {
            client.xautoclaim.mockResolvedValueOnce(['0-0', [['8-0', ['data', json({ a: 8 })]]]]);

            await service.reclaimIdle('s', 'g', 'c', jest.fn().mockRejectedValue(new Error('nope')));

            expect(client.xadd.mock.calls[0][0]).toBe('s.dead');
            expect(client.xack).toHaveBeenCalledWith('s', 'g', '8-0');
        });
    });

    describe('status (used by GET /health)', () => {
        afterEach(() => jest.useRealTimers());

        it('is ok while the loops keep completing reads and stale when one stops', () => {
            jest.useFakeTimers();
            (service as any).lastBeat.set('match.computed', Date.now());
            (service as any).lastBeat.set('prep.ready', Date.now());
            expect(service.status()).toEqual({ ok: true, stale: [] });

            jest.advanceTimersByTime(20_000);
            (service as any).lastBeat.set('match.computed', Date.now());
            jest.advanceTimersByTime(20_000);

            expect(service.status()).toEqual({ ok: false, stale: ['prep.ready'] });
        });
    });
});
