import { JsonLogger } from './json-logger';
import { internalHeaders, requestHeaders } from './outgoing-headers';
import { requestIdMiddleware } from './request-id.middleware';
import { currentRequestId, runWithRequestId } from './request-context';

describe('outgoing headers', () => {
    afterEach(() => delete process.env.INTERNAL_API_KEY);

    it('internal calls carry the shared key, and the requestId when there is one', () => {
        process.env.INTERNAL_API_KEY = 'k';

        expect(internalHeaders()).toEqual({ 'x-internal-key': 'k' });
        expect(runWithRequestId('r1', () => internalHeaders())).toEqual({ 'x-internal-key': 'k', 'x-request-id': 'r1' });
    });

    it('sends no key when INTERNAL_API_KEY is unset (local dev)', () => {
        expect(internalHeaders()['x-internal-key']).toBeUndefined();
    });

    it('other calls carry only the requestId', () => {
        process.env.INTERNAL_API_KEY = 'k';

        expect(requestHeaders()).toEqual({});
        expect(runWithRequestId('r1', () => requestHeaders())).toEqual({ 'x-request-id': 'r1' });
    });
});

describe('requestIdMiddleware', () => {
    const run = (header?: unknown, url = '/chat/conversations?x=1') => {
        const handlers: Record<string, () => void> = {};
        const req: any = { headers: header === undefined ? {} : { 'x-request-id': header }, method: 'GET', originalUrl: url };
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

    it('creates one when there is none, and replaces one that looks unsafe', () => {
        expect(run().seen).toMatch(/^[0-9a-f-]{36}$/);
        expect(run('bad id\nwith newline').seen).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('does not fail when the response ends (access line) or for /health', () => {
        expect(() => run('abc', '/health').handlers.finish()).not.toThrow();
    });
});

describe('JsonLogger', () => {
    const env = { ...process.env };
    let out: jest.SpyInstance;
    let err: jest.SpyInstance;

    beforeEach(() => {
        delete process.env.LOG_LEVEL;
        out = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
        err = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    });

    afterEach(() => {
        out.mockRestore();
        err.mockRestore();
        process.env = { ...env };
    });

    const line = (spy: jest.SpyInstance) => JSON.parse(spy.mock.calls[0][0]);

    it('prints one JSON line with ts, level, service, requestId and msg', () => {
        new JsonLogger().log('hello', 'ChatService');

        expect(line(out)).toMatchObject({ level: 'info', service: 'chat-service', requestId: null, msg: 'hello', context: 'ChatService' });
        expect(line(out).ts).toEqual(expect.any(String));
    });

    it('includes the requestId of the request being handled', () => {
        runWithRequestId('req-7', () => new JsonLogger().warn('careful'));

        expect(line(out)).toMatchObject({ level: 'warn', requestId: 'req-7' });
    });

    it('errors go to stderr, with the stack when there is one', () => {
        new JsonLogger().error('boom', 'the stack', 'ChatService');

        expect(out).not.toHaveBeenCalled();
        expect(line(err)).toMatchObject({ level: 'error', msg: 'boom', stack: 'the stack', context: 'ChatService' });
    });

    it('LOG_LEVEL hides what is below it', () => {
        process.env.LOG_LEVEL = 'error';
        new JsonLogger().log('hidden');
        new JsonLogger().warn('hidden too');

        expect(out).not.toHaveBeenCalled();
    });
});
