import { ChatRateLimiter } from './chat-rate-limiter.service';

jest.mock('../redis/redis.service', () => ({ RedisService: class {} }));

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/** The three Redis commands the limiter uses, with keys that expire on a clock the test controls. */
class FakeRedis {
    private store = new Map<string, { value: number; expiresAt: number | null }>();
    constructor(private clock: { now: number }) { }

    private live(key: string) {
        const e = this.store.get(key);
        if (e && e.expiresAt !== null && e.expiresAt <= this.clock.now) {
            this.store.delete(key);
            return undefined;
        }
        return e;
    }
    async incr(key: string) {
        const e = this.live(key);
        if (e) return ++e.value;
        this.store.set(key, { value: 1, expiresAt: null });
        return 1;
    }
    async pttl(key: string) {
        const e = this.live(key);
        if (!e) return -2;
        return e.expiresAt === null ? -1 : e.expiresAt - this.clock.now;
    }
    async pexpire(key: string, ms: number) {
        const e = this.live(key);
        if (!e) return 0;
        e.expiresAt = this.clock.now + ms;
        return 1;
    }
    seed(key: string, value: number, expiresAt: number | null = null) {
        this.store.set(key, { value, expiresAt });
    }
}

describe('ChatRateLimiter', () => {
    const env = { ...process.env };
    let clock: { now: number };
    let server: FakeRedis;
    let nowSpy: jest.SpyInstance;

    /** One chat-service instance = one limiter with its own Redis client, all talking to the same server. */
    const instance = () => new ChatRateLimiter({ client: server } as any);
    const send = async (limiter: ChatRateLimiter, userId: string, times: number) => {
        let last: Awaited<ReturnType<ChatRateLimiter['check']>> = { allowed: true };
        for (let i = 0; i < times; i++) last = await limiter.check(userId);
        return last;
    };

    beforeEach(() => {
        delete process.env.CHAT_RATE_PER_MINUTE;
        delete process.env.CHAT_RATE_PER_DAY;
        clock = { now: 1_000_000 };
        server = new FakeRedis(clock);
        nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => clock.now);
    });

    afterEach(() => {
        nowSpy.mockRestore();
        process.env = { ...env };
    });

    describe('per minute (default 10)', () => {
        it('lets the first 10 messages through', async () => {
            const limiter = instance();
            for (let i = 0; i < 10; i++) expect(await limiter.check('u1')).toEqual({ allowed: true });
        });

        it('refuses the 11th and says how long to wait', async () => {
            const limiter = instance();
            await send(limiter, 'u1', 10);
            clock.now += 20_000;

            expect(await limiter.check('u1')).toEqual({
                allowed: false, retryAfterSec: 40, message: "You're sending messages too fast. Please wait 40s and try again.",
            });
        });

        it('lets the user send again once the minute is over', async () => {
            const limiter = instance();
            await send(limiter, 'u1', 11);
            clock.now += MINUTE + 1;

            expect(await limiter.check('u1')).toEqual({ allowed: true });
        });

        it('keeps asking for at least one second', async () => {
            const limiter = instance();
            await send(limiter, 'u1', 10);
            clock.now += MINUTE - 100;

            expect(await limiter.check('u1')).toMatchObject({ allowed: false, retryAfterSec: 1 });
        });
    });

    describe('per day (default 200)', () => {
        it('refuses the message after the daily allowance and says "tomorrow"', async () => {
            process.env.CHAT_RATE_PER_MINUTE = '1000';
            process.env.CHAT_RATE_PER_DAY = '3';
            const limiter = instance();
            await send(limiter, 'u1', 3);

            expect(await limiter.check('u1')).toEqual({
                allowed: false, retryAfterSec: DAY / 1000, message: 'You have reached the daily message limit. Please try again tomorrow.',
            });
        });

        it('allows messages again after 24 hours', async () => {
            process.env.CHAT_RATE_PER_MINUTE = '1000';
            process.env.CHAT_RATE_PER_DAY = '3';
            const limiter = instance();
            await send(limiter, 'u1', 4);
            clock.now += DAY + 1;

            expect(await limiter.check('u1')).toEqual({ allowed: true });
        });

        it('a message the minute limit refused does not use up the daily allowance', async () => {
            process.env.CHAT_RATE_PER_MINUTE = '2';
            process.env.CHAT_RATE_PER_DAY = '3';
            const limiter = instance();
            await send(limiter, 'u1', 2);
            expect(await send(limiter, 'u1', 5)).toMatchObject({ allowed: false }); // five refused attempts in the same minute
            clock.now += MINUTE + 1;

            expect(await limiter.check('u1')).toEqual({ allowed: true });            // the 3rd real message of the day
            expect(await limiter.check('u1')).toMatchObject({ allowed: false, message: expect.stringContaining('daily') }); // the 4th
        });
    });

    describe('shared by all instances', () => {
        it('two instances count together: 6 + 4 messages use up the 10 of the minute', async () => {
            const a = instance();
            const b = instance();
            await send(a, 'u1', 6);
            await send(b, 'u1', 4);

            expect(await a.check('u1')).toMatchObject({ allowed: false });
            expect(await b.check('u1')).toMatchObject({ allowed: false });
        });

        it('two instances share the daily allowance too', async () => {
            process.env.CHAT_RATE_PER_MINUTE = '1000';
            process.env.CHAT_RATE_PER_DAY = '5';
            const a = instance();
            const b = instance();
            await send(a, 'u1', 3);
            await send(b, 'u1', 2);

            expect(await a.check('u1')).toMatchObject({ allowed: false, message: expect.stringContaining('daily') });
        });

        it('a second instance started later sees the counters of the first', async () => {
            await send(instance(), 'u1', 10);

            expect(await instance().check('u1')).toMatchObject({ allowed: false });
        });
    });

    describe('settings and keys', () => {
        it('CHAT_RATE_PER_MINUTE / CHAT_RATE_PER_DAY change the limits', async () => {
            process.env.CHAT_RATE_PER_MINUTE = '2';
            const limiter = instance();

            expect(await send(limiter, 'u1', 2)).toEqual({ allowed: true });
            expect(await limiter.check('u1')).toMatchObject({ allowed: false });
        });

        it('falls back to the defaults for a value that is not a number', async () => {
            process.env.CHAT_RATE_PER_MINUTE = 'lots';
            const limiter = instance();

            expect(await send(limiter, 'u1', 10)).toEqual({ allowed: true });
            expect(await limiter.check('u1')).toMatchObject({ allowed: false });
        });

        it('every user has their own counters', async () => {
            const limiter = instance();
            await send(limiter, 'u1', 11);

            expect(await limiter.check('u1')).toMatchObject({ allowed: false });
            expect(await limiter.check('u2')).toEqual({ allowed: true });
        });

        it('the counters expire by themselves: 60 s and 24 h', async () => {
            await instance().check('u1');

            expect(await server.pttl('chat:rate:minute:u1')).toBe(MINUTE);
            expect(await server.pttl('chat:rate:day:u1')).toBe(DAY);
        });

        it('gives a counter that lost its expiry a new one, so nobody is blocked forever', async () => {
            server.seed('chat:rate:minute:u1', 3, null);

            await instance().check('u1');

            expect(await server.pttl('chat:rate:minute:u1')).toBe(MINUTE);
        });

        it('does not touch the daily counter when the minute limit refuses the message', async () => {
            const limiter = instance();
            await send(limiter, 'u1', 10);
            await send(limiter, 'u1', 3);

            // 10 messages went through, the 3 refused ones are not in the day count
            expect(await server.incr('chat:rate:day:u1')).toBe(11);
        });
    });

    it('lets the error through when Redis cannot be reached (the guard decides what to do)', async () => {
        const broken = { client: { incr: jest.fn().mockRejectedValue(new Error('Command timed out')) } };

        await expect(new ChatRateLimiter(broken as any).check('u1')).rejects.toThrow('Command timed out');
    });
});
