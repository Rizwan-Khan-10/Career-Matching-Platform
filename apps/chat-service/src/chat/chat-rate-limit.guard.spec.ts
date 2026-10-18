import { ExecutionContext, HttpException } from '@nestjs/common';
import { ChatRateLimitGuard } from './chat-rate-limit.guard';
import { ChatRateLimiter } from './chat-rate-limiter.service';

jest.mock('../redis/redis.service', () => ({ RedisService: class {} }));

describe('ChatRateLimitGuard', () => {
    const setup = (user: unknown = { userId: 'u1', role: 'APPLICANT' }) => {
        const res = { setHeader: jest.fn() };
        const ctx = { switchToHttp: () => ({ getRequest: () => ({ user }), getResponse: () => res }) } as unknown as ExecutionContext;
        const limiter = { check: jest.fn().mockResolvedValue({ allowed: true }) };
        return { res, ctx, limiter, guard: new ChatRateLimitGuard(limiter as unknown as ChatRateLimiter) };
    };

    it('lets an allowed message through', async () => {
        const { guard, ctx, limiter, res } = setup();

        await expect(guard.canActivate(ctx)).resolves.toBe(true);

        expect(limiter.check).toHaveBeenCalledWith('u1');
        expect(res.setHeader).not.toHaveBeenCalled();
    });

    it('answers 429 with Retry-After and the message when the limit is reached', async () => {
        const { guard, ctx, limiter, res } = setup();
        limiter.check.mockResolvedValue({ allowed: false, retryAfterSec: 42, message: "You're sending messages too fast. Please wait 42s and try again." });

        const err: HttpException = await guard.canActivate(ctx).catch((e) => e);

        expect(err).toBeInstanceOf(HttpException);
        expect(err.getStatus()).toBe(429);
        expect(err.getResponse()).toEqual({ statusCode: 429, message: "You're sending messages too fast. Please wait 42s and try again.", error: 'Too Many Requests' });
        expect(res.setHeader).toHaveBeenCalledWith('Retry-After', '42');
    });

    it('does not count a request that has no user (JwtAuthGuard already rejected it)', async () => {
        const { guard, ctx, limiter } = setup(null); // null, not undefined: undefined would pick the default user

        await expect(guard.canActivate(ctx)).resolves.toBe(true);
        expect(limiter.check).not.toHaveBeenCalled();
    });

    it('lets the message through when Redis is unreachable', async () => {
        const { guard, ctx, limiter } = setup();
        limiter.check.mockRejectedValue(new Error('Command timed out'));

        await expect(guard.canActivate(ctx)).resolves.toBe(true);
    });
});
