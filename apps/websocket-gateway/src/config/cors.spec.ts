import { allowedOrigins, corsOrigin } from './cors';

const check = (origin: string | undefined) => {
    let result: boolean | undefined;
    corsOrigin(origin, (_err, allow) => {
        result = allow;
    });
    return result;
};

describe('CORS (origin = WEB_URL)', () => {
    const saved = process.env.WEB_URL;
    afterEach(() => {
        if (saved === undefined) delete process.env.WEB_URL;
        else process.env.WEB_URL = saved;
    });

    it('allows WEB_URL (also with a trailing slash or another letter case) and nothing else', () => {
        process.env.WEB_URL = 'https://app.example.com/';
        expect(check('https://app.example.com')).toBe(true);
        expect(check('HTTPS://APP.EXAMPLE.COM')).toBe(true);
        expect(check('https://evil.example.com')).toBe(false);
        expect(check('http://app.example.com')).toBe(false); // other scheme = other origin
    });

    it('accepts several origins separated by commas', () => {
        process.env.WEB_URL = 'http://localhost:3000, http://localhost';
        expect(check('http://localhost')).toBe(true);
        expect(check('http://localhost:3000')).toBe(true);
        expect(check('http://localhost:4000')).toBe(false);
    });

    it('defaults to http://localhost:3000 when WEB_URL is not set', () => {
        delete process.env.WEB_URL;
        expect(allowedOrigins()).toEqual(['http://localhost:3000']);
    });

    it('lets requests without an Origin header through (not a browser)', () => {
        process.env.WEB_URL = 'https://app.example.com';
        expect(check(undefined)).toBe(true);
    });
});