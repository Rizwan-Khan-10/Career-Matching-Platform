import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request';
import { ChatRateLimiter, RateVerdict } from './chat-rate-limiter.service';

/**
 * Applies ChatRateLimiter to the routes that call the LLM. Runs AFTER JwtAuthGuard (class-level guards run before
 * method-level ones), so req.user is always set.
 * If Redis cannot be reached the message is let through (and logged): a Redis outage should not take the chat down.
 */
@Injectable()
export class ChatRateLimitGuard implements CanActivate {
    private readonly logger = new Logger(ChatRateLimitGuard.name);

    constructor(private limiter: ChatRateLimiter) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const http = context.switchToHttp();
        const userId = http.getRequest<AuthenticatedRequest>().user?.userId;
        if (!userId) return true; // not authenticated: JwtAuthGuard already rejected it

        let verdict: RateVerdict;
        try {
            verdict = await this.limiter.check(userId);
        } catch (err) {
            this.logger.warn(`rate limit check failed, letting the message through: ${(err as Error).message}`);
            return true;
        }

        if (!verdict.allowed) {
            http.getResponse<{ setHeader(name: string, value: string): void }>().setHeader('Retry-After', String(verdict.retryAfterSec));
            throw new HttpException({ statusCode: HttpStatus.TOO_MANY_REQUESTS, message: verdict.message, error: 'Too Many Requests' }, HttpStatus.TOO_MANY_REQUESTS);
        }
        return true;
    }
}
