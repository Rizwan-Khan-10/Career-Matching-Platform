import { JsonLogger } from './json-logger';
import { requestIdMiddleware } from './request-context';

function capture(fn: () => void): Record<string, unknown>[] {
    const spy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    try { fn(); return spy.mock.calls.map(([c]) => JSON.parse(String(c))); } finally { spy.mockRestore(); }
}

describe('JsonLogger', () => {
    it('writes one JSON line with ts, level, service, requestId and msg', () => {
        const [line] = capture(() => new JsonLogger('resume-service', 'info').log('hello', 'ResumeService'));
        expect(line).toMatchObject({ level: 'info', service: 'resume-service', requestId: null, msg: 'hello', context: 'ResumeService' });
        expect(typeof line.ts).toBe('string');
    });

    it('includes the requestId of the current request', () => {
        const logger = new JsonLogger('resume-service', 'info');
        let lines: Record<string, unknown>[] = [];
        requestIdMiddleware({ headers: { 'x-request-id': 'req-1' } } as any, { setHeader: () => undefined } as any, () => {
            lines = capture(() => logger.warn('careful'));
        });
        expect(lines[0]).toMatchObject({ level: 'warn', requestId: 'req-1' });
    });

    it('drops messages below the configured level', () => {
        expect(capture(() => new JsonLogger('resume-service', 'warn').log('quiet'))).toHaveLength(0);
        expect(capture(() => new JsonLogger('resume-service', 'warn').error('loud'))).toHaveLength(1);
    });
});