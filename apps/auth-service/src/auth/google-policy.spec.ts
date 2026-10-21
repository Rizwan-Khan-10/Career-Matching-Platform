import { ForbiddenException } from '@nestjs/common';
import { assertGoogleAllowed, isGoogleSignInAllowed } from './signup-policy';

describe('Google sign-in policy', () => {
  it('is allowed only while sign-up is open', () => {
    expect(isGoogleSignInAllowed({ registrationMode: 'open' })).toBe(true);
    expect(isGoogleSignInAllowed({ registrationMode: 'invite_only' })).toBe(false);
    expect(isGoogleSignInAllowed({ registrationMode: 'domain' })).toBe(false);
  });

  it('answers 403 in college modes', () => {
    expect(() => assertGoogleAllowed({ registrationMode: 'invite_only' })).toThrow(ForbiddenException);
    expect(() => assertGoogleAllowed({ registrationMode: 'domain' })).toThrow(ForbiddenException);
    expect(() => assertGoogleAllowed({ registrationMode: 'open' })).not.toThrow();
  });
});