import { ForbiddenException } from '@nestjs/common';
import { SystemSettings } from '../settings/settings';

/** Server-side registration-mode check (Spec §9.1). Throws 403 with a readable message. */
export function assertSignupAllowed(settings: SystemSettings, email: string): void {
  if (settings.registrationMode === 'invite_only') {
    throw new ForbiddenException(
      'Sign-up is closed. Please ask your institution administrator to create an account for you.',
    );
  }

  if (settings.registrationMode === 'domain') {
    const domain = email.slice(email.lastIndexOf('@') + 1).toLowerCase();
    if (!settings.allowedDomains.includes(domain)) {
      throw new ForbiddenException(
        'Sign-up is limited to approved email domains. Please use your institution email address.',
      );
    }
  }
}

/** Contract §4.5: pending only when mode != invite_only AND companyApprovalRequired. */
export function resolveCompanyStatus(settings: SystemSettings): 'pending' | 'approved' {
  return settings.registrationMode !== 'invite_only' && settings.companyApprovalRequired
    ? 'pending'
    : 'approved';
}

/**
 * Google sign-in only works while sign-up is open.
 * College use (invite_only, or domain-limited) is password-only on purpose: institution e-mail
 * addresses are often not Google accounts, or their admin blocks third-party sign-in.
 * To allow Google in domain mode later, change only this function.
 */
export function isGoogleSignInAllowed(settings: Pick<SystemSettings, 'registrationMode'>): boolean {
  return settings.registrationMode === 'open';
}

export function assertGoogleAllowed(settings: Pick<SystemSettings, 'registrationMode'>): void {
  if (!isGoogleSignInAllowed(settings)) {
    throw new ForbiddenException('Google sign-in is not available. Please log in with your email and password.');
  }
}