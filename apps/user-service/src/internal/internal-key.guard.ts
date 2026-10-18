import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'crypto';

const digest = (value: string) => createHash('sha256').update(value).digest();

/** Contract §3.3: /internal/* needs header x-internal-key. Skipped when INTERNAL_API_KEY is unset (local dev). */
@Injectable()
export class InternalKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const expected = process.env.INTERNAL_API_KEY;
    if (!expected) return true;

    const header = context.switchToHttp().getRequest().headers['x-internal-key'];
    const given = Array.isArray(header) ? header[0] : header;
    if (typeof given === 'string' && timingSafeEqual(digest(given), digest(expected))) return true;

    throw new ForbiddenException('Invalid internal key');
  }
}