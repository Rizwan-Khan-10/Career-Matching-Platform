import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request';

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/**
 * Per-user limit on LLM calls (every message costs Groq quota that the whole platform shares).
 * Defaults: 10 messages / minute and 200 / day per user. Override with CHAT_RATE_PER_MINUTE / CHAT_RATE_PER_DAY.
 * Runs AFTER JwtAuthGuard (class-level guards run before method-level ones), so req.user is always set.
 * In-memory = per process: fine for one instance; with several chat-service instances move the counters to Redis.
 */
@Injectable()
export class ChatRateLimitGuard implements CanActivate {
    private readonly hits = new Map<string, number[]>();
    private calls = 0;

    private get perMinute() { return Number(process.env.CHAT_RATE_PER_MINUTE) || 10; }
    private get perDay() { return Number(process.env.CHAT_RATE_PER_DAY) || 200; }

    canActivate(context: ExecutionContext): boolean {
        const http = context.switchToHttp();
        const userId = http.getRequest<AuthenticatedRequest>().user?.userId;
        if (!userId) return true; // not authenticated: JwtAuthGuard already rejected it

        const now = Date.now();
        const day = (this.hits.get(userId) ?? []).filter((t) => now - t < DAY_MS);
        const minute = day.filter((t) => now - t < MINUTE_MS);

        let retryAfterSec = 0;
        let message = '';
        if (minute.length >= this.perMinute) {
            retryAfterSec = Math.ceil((minute[0] + MINUTE_MS - now) / 1000);
            message = `You're sending messages too fast. Please wait ${retryAfterSec}s and try again.`;
        } else if (day.length >= this.perDay) {
            retryAfterSec = Math.ceil((day[0] + DAY_MS - now) / 1000);
            message = 'You have reached the daily message limit. Please try again tomorrow.';
        }

        if (retryAfterSec > 0) {
            http.getResponse<{ setHeader(name: string, value: string): void }>().setHeader('Retry-After', String(retryAfterSec));
            throw new HttpException({ statusCode: HttpStatus.TOO_MANY_REQUESTS, message, error: 'Too Many Requests' }, HttpStatus.TOO_MANY_REQUESTS);
        }

        day.push(now);
        this.hits.set(userId, day);
        if (++this.calls % 500 === 0) this.sweep(now);
        return true;
    }

    /** drop users with no activity in the last 24h so the map cannot grow forever */
    private sweep(now: number) {
        for (const [id, times] of this.hits) if (!times.length || now - times[times.length - 1] >= DAY_MS) this.hits.delete(id);
    }
}