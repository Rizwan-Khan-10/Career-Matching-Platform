import { webCorsOptions } from './cors';

const ask = (opts: ReturnType<typeof webCorsOptions>, origin?: string): boolean => {
    const check = opts.origin;
    if (check === true) return true;
    let out = false;
    check(origin, (_e, allow) => { out = !!allow; });
    return out;
};

describe('webCorsOptions', () => {
    it('allows any origin when WEB_URL is not set (local development)', () => {
        expect(webCorsOptions('').origin).toBe(true);
        expect(webCorsOptions(undefined).origin).toBe(true);
    });

    it('allows only the configured origin(s), ignoring case and a trailing slash', () => {
        const o = webCorsOptions('http://localhost:3000/, https://App.Example.com');
        expect(ask(o, 'http://localhost:3000')).toBe(true);
        expect(ask(o, 'https://app.example.com')).toBe(true);
        expect(ask(o, 'https://evil.example.com')).toBe(false);
    });

    it('lets requests without an Origin header through (not a browser)', () => {
        expect(ask(webCorsOptions('http://localhost:3000'), undefined)).toBe(true);
    });
});
