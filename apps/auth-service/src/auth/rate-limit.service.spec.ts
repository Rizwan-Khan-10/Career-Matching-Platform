import { HttpException } from '@nestjs/common';
import { FakeRedis } from '../../test/fake-redis';
import { RateLimitService } from './rate-limit.service';

describe('RateLimitService', () => {
    it('allows up to max hits, then answers 429', async () => {
        const fake = new FakeRedis();
        const limiter = new RateLimitService({ client: fake } as any);

        for (let i = 0; i < 3; i++) await limiter.assert('signup', '1.1.1.1', 3, 60, 'slow down');
        const err = await limiter.assert('signup', '1.1.1.1', 3, 60, 'slow down').catch((e) => e);

        expect(err).toBeInstanceOf(HttpException);
        expect(err.getStatus()).toBe(429);
        expect(err.message).toBe('slow down');
        expect(fake.ttls.get('rl:signup:1.1.1.1')).toBe(60);
    });

    it('counts every IP separately', async () => {
        const limiter = new RateLimitService({ client: new FakeRedis() } as any);
        await limiter.assert('signup', 'a', 1, 60, 'x');
        await expect(limiter.assert('signup', 'b', 1, 60, 'x')).resolves.toBeUndefined();
    });

    it('lets the request through when Redis is down', async () => {
        const broken = { incr: () => Promise.reject(new Error('down')) };
        const limiter = new RateLimitService({ client: broken } as any);
        await expect(limiter.assert('signup', 'a', 1, 60, 'x')).resolves.toBeUndefined();
    });
});