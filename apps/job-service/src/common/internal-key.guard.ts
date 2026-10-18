import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';

/**
 * Guard for service-to-service routes under /internal/* (contract section 3, rule 3): the caller must send
 * `x-internal-key: $INTERNAL_API_KEY`. When INTERNAL_API_KEY is not set the check is skipped (local dev).
 * Used on every /internal/* handler of this service.
 */
@Injectable()
export class InternalKeyGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
        const expected = process.env.INTERNAL_API_KEY;
        if (!expected) return true;
        const given = context.switchToHttp().getRequest().headers?.['x-internal-key'];
        if (typeof given === 'string' && this.same(given, expected)) return true;
        throw new UnauthorizedException('Invalid or missing x-internal-key');
    }

    private same(a: string, b: string): boolean {
        const x = Buffer.from(a);
        const y = Buffer.from(b);
        return x.length === y.length && timingSafeEqual(x, y);
    }
}
