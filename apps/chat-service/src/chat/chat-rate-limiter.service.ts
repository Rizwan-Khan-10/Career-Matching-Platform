import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

export type RateVerdict = { allowed: true } | { allowed: false; retryAfterSec: number; message: string };

/**
 * Per-user limit on LLM calls (every message costs Groq quota that the whole platform shares).
 * Defaults: 10 messages / minute and 200 / day per user. Override with CHAT_RATE_PER_MINUTE / CHAT_RATE_PER_DAY.
 *
 * The counters live in Redis (one `INCR` per window), so any number of chat-service instances share ONE limit.
 * A window starts with the user's first message and ends when its key expires (60 s / 24 h later). A message that
 * the minute limit refuses does not use up the daily allowance.
 */
@Injectable()
export class ChatRateLimiter {
    constructor(private redis: RedisService) { }

    private get perMinute() { return Number(process.env.CHAT_RATE_PER_MINUTE) || 10; }
    private get perDay() { return Number(process.env.CHAT_RATE_PER_DAY) || 200; }

    /** Counts this message and says whether it may go through. Throws when Redis cannot be reached. */
    async check(userId: string): Promise<RateVerdict> {
        const minute = await this.hit(`chat:rate:minute:${userId}`, MINUTE_MS);
        if (minute.count > this.perMinute) {
            const retryAfterSec = seconds(minute.ttlMs);
            return { allowed: false, retryAfterSec, message: `You're sending messages too fast. Please wait ${retryAfterSec}s and try again.` };
        }

        const day = await this.hit(`chat:rate:day:${userId}`, DAY_MS);
        if (day.count > this.perDay) {
            return { allowed: false, retryAfterSec: seconds(day.ttlMs), message: 'You have reached the daily message limit. Please try again tomorrow.' };
        }
        return { allowed: true };
    }

    /** INCR is atomic, so two instances can never both take the last slot. */
    private async hit(key: string, windowMs: number): Promise<{ count: number; ttlMs: number }> {
        const client = this.redis.client;
        const count = await client.incr(key);
        let ttlMs = await client.pttl(key);
        if (ttlMs < 0) {
            // first hit of the window (or a key that lost its expiry): the window starts now
            await client.pexpire(key, windowMs);
            ttlMs = windowMs;
        }
        return { count, ttlMs };
    }
}

const seconds = (ms: number) => Math.max(1, Math.ceil(ms / 1000));
