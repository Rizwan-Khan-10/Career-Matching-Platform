import { getRequestId, newRequestId, requestIdMiddleware } from './request-context';

function run(headers: Record<string, string | string[]>) {
    const res = { setHeader: jest.fn() };
    let seen: string | undefined;
    requestIdMiddleware({ headers } as any, res as any, () => { seen = getRequestId(); });
    return { seen, res };
}

describe('request id', () => {
    it('keeps a valid x-request-id from the caller and echoes it', () => {
        const { seen, res } = run({ 'x-request-id': 'abc-123' });
        expect(seen).toBe('abc-123');
        expect(res.setHeader).toHaveBeenCalledWith('x-request-id', 'abc-123');
    });

    it('creates one when the header is missing or unsafe', () => {
        expect(run({}).seen).toMatch(/^[0-9a-f-]{36}$/);
        expect(run({ 'x-request-id': 'bad id\nwith newline' }).seen).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('newRequestId() makes a fresh uuid outside a request', () => {
        expect(getRequestId()).toBeUndefined();
        expect(newRequestId()).toMatch(/^[0-9a-f-]{36}$/);
    });
});