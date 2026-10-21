export const REGISTRATION_MODES = ['open', 'invite_only', 'domain'] as const;
export type RegistrationMode = (typeof REGISTRATION_MODES)[number];

export interface SystemSettings {
  registrationMode: RegistrationMode;
  allowedDomains: string[];
  companyApprovalRequired: boolean;
  jobApprovalRequired: boolean;
  /** When on, an ADMIN must have 2FA: one without it is sent through setup at login. */
  requireTwoFactorForAdmin: boolean;
  /** When on, a self-signup must click the link in an e-mail before the first login. */
  emailVerificationRequired: boolean;
}

export const DEFAULT_SETTINGS: SystemSettings = {
  registrationMode: 'open',
  allowedDomains: [],
  companyApprovalRequired: true,
  jobApprovalRequired: false,
  requireTwoFactorForAdmin: false,
  emailVerificationRequired: true,
};

/** "@College.edu " -> "college.edu" */
export function normalizeDomain(value: string): string {
  return value.trim().toLowerCase().replace(/^@/, '');
}

/** Turns raw key/value rows into a complete, valid settings object (defaults fill any gap). */
export function normalizeSettings(raw: Record<string, unknown>): SystemSettings {
  const mode = raw.registrationMode;
  const domains = raw.allowedDomains;

  return {
    registrationMode: REGISTRATION_MODES.includes(mode as RegistrationMode)
      ? (mode as RegistrationMode)
      : DEFAULT_SETTINGS.registrationMode,
    allowedDomains: Array.isArray(domains)
      ? domains
        .filter((d): d is string => typeof d === 'string')
        .map(normalizeDomain)
        .filter((d) => d.length > 0)
      : [],
    companyApprovalRequired:
      typeof raw.companyApprovalRequired === 'boolean'
        ? raw.companyApprovalRequired
        : DEFAULT_SETTINGS.companyApprovalRequired,
    jobApprovalRequired:
      typeof raw.jobApprovalRequired === 'boolean'
        ? raw.jobApprovalRequired
        : DEFAULT_SETTINGS.jobApprovalRequired,
    requireTwoFactorForAdmin:
      typeof raw.requireTwoFactorForAdmin === 'boolean'
        ? raw.requireTwoFactorForAdmin
        : DEFAULT_SETTINGS.requireTwoFactorForAdmin,
    emailVerificationRequired:
      typeof raw.emailVerificationRequired === 'boolean'
        ? raw.emailVerificationRequired
        : DEFAULT_SETTINGS.emailVerificationRequired,
  };
}

const DOMAIN_PATTERN = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** Expects an already-normalized (lower-case) domain such as "college.edu". */
export function isValidDomain(value: string): boolean {
  return DOMAIN_PATTERN.test(value);
}