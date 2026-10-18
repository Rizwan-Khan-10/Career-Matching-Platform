import { ForbiddenException } from '@nestjs/common';
import { InternalKeyGuard } from './internal-key.guard';

const ctx = (headers: Record<string, string>) =>
  ({ switchToHttp: () => ({ getRequest: () => ({ headers }) }) }) as any;

describe('InternalKeyGuard', () => {
  const original = process.env.INTERNAL_API_KEY;
  afterEach(() => {
    if (original === undefined) delete process.env.INTERNAL_API_KEY;
    else process.env.INTERNAL_API_KEY = original;
  });

  it('lets everything through when INTERNAL_API_KEY is not set (local dev)', () => {
    delete process.env.INTERNAL_API_KEY;
    expect(new InternalKeyGuard().canActivate(ctx({}))).toBe(true);
  });

  it('accepts the right key', () => {
    process.env.INTERNAL_API_KEY = 'secret';
    expect(new InternalKeyGuard().canActivate(ctx({ 'x-internal-key': 'secret' }))).toBe(true);
  });

  it('rejects a missing or wrong key with 403', () => {
    process.env.INTERNAL_API_KEY = 'secret';
    const guard = new InternalKeyGuard();
    expect(() => guard.canActivate(ctx({}))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(ctx({ 'x-internal-key': 'wrong' }))).toThrow(ForbiddenException);
  });
});