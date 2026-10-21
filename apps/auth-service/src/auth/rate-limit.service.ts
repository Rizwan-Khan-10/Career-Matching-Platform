import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

/** Simple fixed-window counter in Redis. Redis down = allowed (same fail-open rule as LoginLockService). */
@Injectable()
export class RateLimitService {
    constructor(private redis: RedisService) { }

    /** Counts one hit and throws 429 when the caller is over the limit. */
    async assert(bucket: string, id: string, max: number, windowSeconds: number, message: string): Promise<void> {
        if (await this.hit(bucket, id, max, windowSeconds)) {
            throw new HttpException(message, HttpStatus.TOO_MANY_REQUESTS);
        }
    }

    private async hit(bucket: string, id: string, max: number, windowSeconds: number): Promise<boolean> {
        const key = `rl:${bucket}:${id}`;
        try {
            const count = await this.redis.client.incr(key);
            // the ttl check repairs a key whose EXPIRE failed earlier (same trick as LoginLockService)
            if (count === 1 || (await this.redis.client.ttl(key)) < 0) {
                await this.redis.client.expire(key, windowSeconds);
            }
            return count > max;
        } catch {
            return false;
        }
    }
}