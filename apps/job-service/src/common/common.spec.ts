import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { internalHeaders, publishEvent, publishEvents, STREAM_MAXLEN } from './events';
import { JsonLogger } from './json-logger';
import { InternalKeyGuard } from './internal-key.guard';
import { requestIdMiddleware } from './request-id.middleware';
import { currentRequestId, runWithRequestId } from './request-context';

describe('publishEvent (contract section 3, rules 1 and 2)', () => {
    const redis = () => ({ client: { xadd: jest.fn().mockResolvedValue('1-0') } });
    const sent = (r: any) => {
        const [stream, maxlen, approx, limit, id, field, json] = r.client.xadd.mock.calls[0];
        return { stream, head: [maxlen, approx, limit, id, field], data: JSON.parse(json) };
    };

    it('trims every stream with MAXLEN ~ 10000 and writes one JSON field called data', async () => {
        const r = redis();
        await publishEvent(r, 'candidate.ready', { matchId: 'm1' });

        expect(STREAM_MAXLEN).toBe(10000);
        expect(sent(r)).toMatchObject({ stream: 'candidate.ready', head: ['MAXLEN', '~', 10000, '*', 'data'], data: { matchId: 'm1' } });
    });

    it('creates a requestId when there is none', async () => {
        const r = redis();
        await publishEvent(r, 's', { a: 1 });

        expect(sent(r).data.requestId).toEqual(expect.any(String));
    });

    it('copies the requestId of the event or request being handled', async () => {
        const r = redis();
        await runWithRequestId('req-123', () => publishEvent(r, 's', { a: 1 }));

        expect(sent(r).data.requestId).toBe('req-123');
    });

    it('lets an explicit requestId in the payload win', async () => {
        const r = redis();
        await runWithRequestId('req-123', () => publishEvent(r, 's', { requestId: 'explicit' }));

        expect(sent(r).data.requestId).toBe('explicit');
    });
});

describe('publishEvents (one Redis transaction)', () => {
    const pipelineRedis = (exec: () => Promise<unknown>) => {
        const pipeline: any = { xadd: jest.fn().mockReturnThis(), exec: jest.fn(exec) };
        return { redis: { client: { multi: jest.fn(() => pipeline) } }, pipeline };
    };

    it('queues every event with MAXLEN and the same requestId, then runs them together', async () => {
        const { redis, pipeline } = pipelineRedis(async () => [[null, '1-0'], [null, '2-0']]);

        await runWithRequestId('req-9', () => publishEvents(redis, [
            { stream: 'jd.uploaded', payload: { a: 1 } },
            { stream: 'job.approval.changed', payload: { b: 2 } },
        ]));

        expect(redis.client.multi).toHaveBeenCalledTimes(1);
        expect(pipeline.xadd.mock.calls.map((c: any[]) => [c[0], ...c.slice(1, 6)])).toEqual([
            ['jd.uploaded', 'MAXLEN', '~', 10000, '*', 'data'],
            ['job.approval.changed', 'MAXLEN', '~', 10000, '*', 'data'],
        ]);
        expect(pipeline.xadd.mock.calls.map((c: any[]) => JSON.parse(c[6]).requestId)).toEqual(['req-9', 'req-9']);
        expect(pipeline.exec).toHaveBeenCalledTimes(1);
    });

    it('throws when the transaction was aborted, a command failed, or exec itself failed', async () => {
        await expect(publishEvents(pipelineRedis(async () => null).redis, [{ stream: 's', payload: {} }])).rejects.toThrow(/aborted/);
        await expect(publishEvents(pipelineRedis(async () => [[new Error('OOM'), null]]).redis, [{ stream: 's', payload: {} }])).rejects.toThrow('OOM');
        await expect(publishEvents(pipelineRedis(async () => { throw new Error('connection lost'); }).redis, [{ stream: 's', payload: {} }])).rejects.toThrow('connection lost');
    });
});

describe('internalHeaders', () => {
    afterEach(() => delete process.env.INTERNAL_API_KEY);

    it('sends the shared key, and the requestId when there is one', () => {
        process.env.INTERNAL_API_KEY = 'k';

        expect(internalHeaders()).toEqual({ 'x-internal-key': 'k' });
        expect(runWithRequestId('r1', () => internalHeaders())).toEqual({ 'x-internal-key': 'k', 'x-request-id': 'r1' });
    });
});

describe('requestIdMiddleware', () => {
    const run = (header?: unknown) => {
        const handlers: Record<string, () => void> = {};
        const req: any = { headers: header === undefined ? {} : { 'x-request-id': header }, method: 'GET', originalUrl: '/matches/mine?x=1' };
        const res: any = { statusCode: 200, setHeader: jest.fn(), on: (e: string, cb: () => void) => { handlers[e] = cb; } };
        let seen: string | undefined;
        requestIdMiddleware(req, res, () => { seen = currentRequestId(); });
        return { res, seen, handlers };
    };

    it('keeps a sane x-request-id from the caller and echoes it back', () => {
        const { res, seen } = run('abc-123');

        expect(seen).toBe('abc-123');
        expect(res.setHeader).toHaveBeenCalledWith('x-request-id', 'abc-123');
    });

    it('replaces a missing or unsafe id with a new one', () => {
        expect(run().seen).toEqual(expect.any(String));
        const bad = run('x y\nz');
        expect(bad.seen).not.toBe('x y\nz');
        expect(bad.res.setHeader).toHaveBeenCalledWith('x-request-id', bad.seen);
    });
});

describe('JsonLogger', () => {
    let out: jest.SpyInstance;
    let err: jest.SpyInstance;
    beforeEach(() => {
        out = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
        err = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    });
    afterEach(() => {
        out.mockRestore();
        err.mockRestore();
        delete process.env.LOG_LEVEL;
    });

    it('writes one JSON line with ts, level, service, requestId and msg', () => {
        runWithRequestId('req-1', () => new JsonLogger().log('hello', 'Ctx'));

        const line = JSON.parse(out.mock.calls[0][0] as string);
        expect(line).toMatchObject({ level: 'info', service: 'job-service', requestId: 'req-1', msg: 'hello', context: 'Ctx' });
        expect(new Date(line.ts).toString()).not.toBe('Invalid Date');
    });

    it('uses null as requestId outside of any request and sends errors to stderr', () => {
        new JsonLogger().error('boom', 'stack text', 'Ctx');

        const line = JSON.parse(err.mock.calls[0][0] as string);
        expect(line).toMatchObject({ level: 'error', requestId: null, msg: 'boom', stack: 'stack text', context: 'Ctx' });
    });

    it('respects LOG_LEVEL', () => {
        process.env.LOG_LEVEL = 'warn';
        const logger = new JsonLogger();
        logger.log('quiet');
        logger.debug('quiet');
        logger.warn('loud');

        expect(out).toHaveBeenCalledTimes(1);
        expect(JSON.parse(out.mock.calls[0][0] as string).msg).toBe('loud');
    });
});

describe('InternalKeyGuard (contract section 3, rule 3)', () => {
    const ctx = (key?: string) => ({ switchToHttp: () => ({ getRequest: () => ({ headers: key === undefined ? {} : { 'x-internal-key': key } }) }) }) as unknown as ExecutionContext;
    afterEach(() => delete process.env.INTERNAL_API_KEY);

    it('lets everything through while INTERNAL_API_KEY is not set (local dev)', () => {
        expect(new InternalKeyGuard().canActivate(ctx())).toBe(true);
    });

    it('accepts the right key and refuses a wrong or missing one', () => {
        process.env.INTERNAL_API_KEY = 'secret-key';
        const guard = new InternalKeyGuard();

        expect(guard.canActivate(ctx('secret-key'))).toBe(true);
        expect(() => guard.canActivate(ctx('wrong'))).toThrow(UnauthorizedException);
        expect(() => guard.canActivate(ctx())).toThrow(UnauthorizedException);
    });
});
